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

import { prompt } from 'inquirer';
import { AccountResolver, CertificatePair, CommandUtils, KeyName, KnownError, Logger } from 'symbol-bootstrap';
import { Account, NetworkType, PublicAccount } from 'symbol-sdk';
import { NodeInformation } from '../model';
import { KeyStore } from './KeyStore';
export class NetworkAccountResolver implements AccountResolver {
    constructor(private readonly logger: Logger, private readonly node: NodeInformation, private readonly keyStore: KeyStore) {}

    public async shouldAnnounce(): Promise<boolean> {
        return true;
    }

    public async resolveAccount(
        networkType: NetworkType,
        account: CertificatePair | undefined,
        keyName: KeyName,
        nodeName: string | undefined,
        operationDescription: string,
        generateErrorMessage: string | undefined,
    ): Promise<Account> {
        if (account && account.privateKey) {
            return Account.createFromPrivateKey(account.privateKey, networkType);
        }
        if (!nodeName) {
            return this.promptAccount(networkType, account, keyName, nodeName, operationDescription, generateErrorMessage);
        }
        this.logger.info(`Loading ${keyName} Key for ${nodeName} number ${this.node.number}. Operation ${operationDescription}`);
        const storedAccount = await this.keyStore.getNodeAccount(networkType, keyName, nodeName, this.node, true);
        if (!storedAccount) {
            throw new Error(`${keyName} for node ${nodeName} does not exist!`);
        }
        if (account && storedAccount.publicKey != account?.publicKey) {
            throw new Error(
                `Invalid public key for for account ${keyName}. Expected ${account.publicKey} but got ${storedAccount.publicKey}`,
            );
        }
        return storedAccount;
    }

    public async promptAccount(
        networkType: NetworkType,
        account: CertificatePair | undefined,
        keyName: KeyName,
        nodeName: string | undefined,
        operationDescription: string,
        generateErrorMessage: string | undefined,
    ): Promise<Account> {
        if (!account) {
            if (generateErrorMessage) {
                throw new KnownError(generateErrorMessage);
            }
            this.logger.info(`Generating ${keyName} account...`);
            return Account.generateNewAccount(networkType);
        }

        if (!account.privateKey) {
            while (true) {
                this.logger.info('');
                this.logger.info(`${keyName} private key is required when ${operationDescription}.`);
                const address = PublicAccount.createFromPublicKey(account.publicKey, networkType).address.plain();
                const nodeDescription = !nodeName ? `of` : `of the Node's '${nodeName}'`;
                const responses = await prompt([
                    {
                        name: 'value',
                        message: `Enter the 64 HEX private key ${nodeDescription} ${keyName} account with Address: ${address} and Public Key: ${account.publicKey}:`,
                        type: 'password',
                        mask: '*',
                        validate: CommandUtils.isValidPrivateKey,
                    },
                ]);
                const privateKey = responses.value === '' ? undefined : responses.value.toUpperCase();
                if (!privateKey) {
                    this.logger.info('Please provide the private key.');
                } else {
                    const enteredAccount = Account.createFromPrivateKey(privateKey, networkType);
                    if (enteredAccount.publicKey.toUpperCase() !== account.publicKey.toUpperCase()) {
                        this.logger.info(
                            `Invalid private key. Expected address is ${address} but you provided the private key for address ${enteredAccount.address.plain()}.\n`,
                        );
                        this.logger.info(`Please re-enter private key.`);
                    } else {
                        account.privateKey = privateKey;
                        return enteredAccount;
                    }
                }
            }
        }
        return Account.createFromPrivateKey(account.privateKey, networkType);
    }
}
