/*
 * Copyright 2022 Fernando Boucquez
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { KeyName, Password, VotingKeyAccount, VotingUtils, YamlUtils } from 'symbol-bootstrap';
import { Account, NetworkType } from 'symbol-sdk';
import { NodeInformation } from '../model';
import { NetworkUtils } from './NetworkUtils';

export type VotingKeyFileContent = VotingKeyAccount & {
    privateFileContent: Uint8Array;
};

export type NetworkAccountName =
    | 'founder'
    | 'faucet'
    | 'nemesisSigner'
    | 'harvestNetworkFeeSink'
    | 'mosaicRentalFeeSink'
    | 'namespaceRentalFeeSink';

export interface KeyStore {
    getNodeAccount(
        networkType: NetworkType,
        keyName: KeyName,
        nodeName: string,
        nodeInformation: NodeInformation,
        generate: boolean,
    ): Promise<Account>;

    getVotingKeyFile(
        networkType: NetworkType,
        nodeName: string,
        nodeInformation: NodeInformation,
        startEpoch: number,
        endEpoch: number,
    ): Promise<VotingKeyFileContent>;

    getNetworkAccount(networkType: NetworkType, accountName: NetworkAccountName, generate: boolean): Promise<Account>;

    saveNetworkAccount(networkType: NetworkType, accountName: NetworkAccountName, privateKey: string): Promise<void>;
}

export class LazyKeyStore implements KeyStore {
    private delegate: KeyStore | undefined;
    constructor(private readonly factory: () => Promise<KeyStore>) {}

    async getNetworkAccount(networkType: NetworkType, accountName: NetworkAccountName, generate: boolean): Promise<Account> {
        return (await this.getDelegate()).getNetworkAccount(networkType, accountName, generate);
    }

    async getNodeAccount(
        networkType: NetworkType,
        keyName: KeyName,
        nodeName: string,
        nodeInformation: NodeInformation,
        generate: boolean,
    ): Promise<Account> {
        return (await this.getDelegate()).getNodeAccount(networkType, keyName, nodeName, nodeInformation, generate);
    }

    async saveNetworkAccount(networkType: NetworkType, accountName: NetworkAccountName, privateKey: string): Promise<void> {
        return (await this.getDelegate()).saveNetworkAccount(networkType, accountName, privateKey);
    }

    private async getDelegate(): Promise<KeyStore> {
        if (!this.delegate) this.delegate = await this.factory();
        return this.delegate;
    }

    async getVotingKeyFile(
        networkType: NetworkType,
        nodeName: string,
        nodeInformation: NodeInformation,
        startEpoch: number,
        endEpoch: number,
    ): Promise<VotingKeyFileContent> {
        return (await this.getDelegate()).getVotingKeyFile(networkType, nodeName, nodeInformation, startEpoch, endEpoch);
    }
}

export interface StoredAccount {
    privateKey: string;
    publicKey: string;
    address: string;
}

export interface KeyStorage {
    network: Partial<Record<NetworkAccountName, StoredAccount>>;
    nodes: Record<string, Record<KeyName, StoredAccount>>;
    votingFiles: Record<string, { publicKey: string; privateFileContent: string }>;
}

export class LocalFileKeyStore implements KeyStore {
    private readonly storage: KeyStorage;
    private readonly storageFile: string;
    constructor(private readonly password: Password, private readonly mustExist: boolean, private readonly workingDir: string) {
        this.storageFile = join(this.workingDir, NetworkUtils.KEY_STORE_FILE);
        const defaultValue = { nodes: {}, network: {}, votingFiles: {} };
        const exist = existsSync(this.storageFile);
        if (!exist && mustExist) {
            throw new Error(`Storage file ${resolve(this.storageFile)} does not exist!`);
        }
        const storedValue = exist ? (YamlUtils.loadYaml(this.storageFile, password) as KeyStorage) : {};
        this.storage = {
            ...defaultValue,
            ...storedValue,
        };
    }

    async getVotingKeyFile(
        networkType: NetworkType,
        nodeName: string,
        nodeInformation: NodeInformation,
        startEpoch: number,
        endEpoch: number,
    ): Promise<VotingKeyFileContent> {
        const votingUtils = new VotingUtils();
        const nodeKey = `${nodeName}-${nodeInformation.number}-${startEpoch}-${endEpoch}`;
        const storedFile = this.storage.votingFiles[nodeKey];
        if (storedFile) {
            const privateFileContent = Buffer.from(storedFile.privateFileContent, 'base64');
            const votingFile = votingUtils.readVotingFile(privateFileContent);
            if (votingFile.startEpoch != startEpoch) {
                throw new Error(`Unexpected startEpoch on stored file. Expected ${startEpoch} but got ${votingFile.startEpoch}`);
            }
            if (votingFile.endEpoch != endEpoch) {
                throw new Error(`Unexpected endEpoch on stored file. Expected ${endEpoch} but got ${votingFile.endEpoch}`);
            }
            return { ...votingFile, privateFileContent };
        }

        const votingAccount = this.generateNewAccount(true, networkType);
        const votingFile = {
            publicKey: votingAccount.publicKey,
            startEpoch: startEpoch,
            endEpoch: endEpoch,
        };
        const privateFileContent = await this.createVotingKeyFile(votingUtils, votingAccount, nodeName, votingFile);
        this.storage.votingFiles = this.storage.votingFiles || {};
        this.storage.votingFiles[nodeKey] = {
            publicKey: votingAccount.publicKey,
            privateFileContent: Buffer.from(privateFileContent).toString('base64'),
        };
        await this.save();
        return { ...votingFile, privateFileContent };
    }

    private async createVotingKeyFile(
        votingUtils: VotingUtils,
        votingAccount: Account,
        nodeName: string,
        votingFile: { endEpoch: number; publicKey: string; startEpoch: number },
    ): Promise<Uint8Array> {
        return votingUtils.createVotingFile(votingAccount.privateKey, votingFile.startEpoch, votingFile.endEpoch);
    }

    async saveNetworkAccount(networkType: NetworkType, accountName: NetworkAccountName, privateKey: string): Promise<void> {
        this.storage.network = this.storage.network || {};
        this.storage.network[accountName] = this.toStored(Account.createFromPrivateKey(privateKey, networkType));
        await this.save();
    }

    async getNetworkAccount(networkType: NetworkType, accountName: NetworkAccountName, generate: boolean): Promise<Account> {
        const storedAccount = this.storage.network[accountName] || this.toStored(this.generateNewAccount(generate, networkType));
        const account = Account.createFromPrivateKey(storedAccount.privateKey, networkType);
        this.storage.network = this.storage.network || {};
        this.storage.network[accountName] = this.toStored(account);
        await this.save();
        return account;
    }

    private save(): Promise<void> {
        return YamlUtils.writeYaml(this.storageFile, this.storage, this.password || undefined);
    }

    async getNodeAccount(
        networkType: NetworkType,
        keyName: KeyName,
        nodeName: string,
        nodeInformation: NodeInformation,
        generate: boolean,
    ): Promise<Account> {
        const nodeKey = `${nodeName}-${nodeInformation.number}`;
        const storedAccount = this.storage.nodes[nodeKey]?.[keyName] || this.toStored(this.generateNewAccount(generate, networkType));
        const account = Account.createFromPrivateKey(storedAccount.privateKey, networkType);
        this.storage.nodes = this.storage.nodes || {};
        this.storage.nodes[nodeKey] = this.storage.nodes[nodeKey] || {};
        this.storage.nodes[nodeKey][keyName] = this.toStored(account);
        await this.save();
        return account;
    }
    public toStored(account: Account): StoredAccount {
        return {
            privateKey: account.privateKey,
            publicKey: account.publicKey,
            address: account.address.plain(),
        };
    }

    protected generateNewAccount(generate: boolean, networkType: NetworkType): Account {
        if (!generate) {
            throw new Error('Account cannot be generated!!');
        }
        return Account.generateNewAccount(networkType);
    }
}
