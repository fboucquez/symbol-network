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
import * as _ from 'lodash';
import { join } from 'path';
import {
    Assembly,
    BootstrapService,
    ConfigService,
    Constants,
    CryptoUtils,
    CustomPreset,
    FileSystemService,
    KeyName,
    Logger,
    NemesisPreset,
    Password,
    PeerInfo,
    YamlUtils,
} from 'symbol-bootstrap';
import { AccountKeyLinkTransaction, Deadline, LinkAction, VotingKeyLinkTransaction, VrfKeyLinkTransaction } from 'symbol-sdk';
import { nodesMetadata, TransactionInformation } from '../model';
import { KeyStore, NetworkAccountResolver, NetworkConfigurationService, NetworkUtils } from '../services';

export interface GenerateNemesisParams {
    regenerate: boolean;
    password: Password;
    composeUser?: string;
}

export class NetworkGenesisService {
    private readonly fileSystemService: FileSystemService;
    constructor(private readonly logger: Logger, private readonly workingDir: string, private readonly keyStore: KeyStore) {
        this.fileSystemService = new FileSystemService(this.logger);
    }

    public async generateNemesis({ regenerate, composeUser, password }: GenerateNemesisParams): Promise<string> {
        const input = await NetworkUtils.loadNetwork(this.workingDir);
        if (!YamlUtils.isYmlFile(input.preset) || !input.isNewNetwork) {
            throw new Error(`You are creating nodes for an existing network. Nemesis cannot be generated!`);
        }
        if (input.nemesisSeedFolder && existsSync(input.nemesisSeedFolder) && !regenerate) {
            throw new Error(`The nemesis block has been previously generated. Use --regenerate.`);
        }
        this.logger.info('');
        const transactions: TransactionInformation[] = [];

        const deadline = Deadline.createFromDTO('1');
        const knownPeers: PeerInfo[] = [];
        const nemesisBalances: {
            mosaicIndex: number;
            address: string;
            amount: number;
        }[] = [];

        const service = new BootstrapService(this.logger);
        const knownRestGateways = [];
        const nemesisTargetFolder = join(this.workingDir, 'nemesis-target');
        const nodesFolder = join(this.workingDir, 'nodes');
        const zipFolder = join(this.workingDir, 'distribution');
        this.fileSystemService.deleteFolder(nemesisTargetFolder);
        this.fileSystemService.deleteFolder(nodesFolder);
        this.fileSystemService.deleteFolder(zipFolder);
        this.logger.info('');
        const networkPreset: CustomPreset = await new NetworkConfigurationService(
            this.logger,
            this.workingDir,
            this.keyStore,
        ).updateNetworkPreset(input.preset, input, input.preset);
        const nemesisGenerationHashSeed = networkPreset.nemesisGenerationHashSeed;
        if (!nemesisGenerationHashSeed) {
            throw new Error(`nemesisGenerationHashSeed could not be resolved`);
        }
        const networkType = input.networkType;
        const nemesisPreset = networkPreset.nemesis as NemesisPreset;
        if (!nemesisPreset) {
            throw new Error('Nemesis must be resolved from network preset!');
        }
        if (!nemesisPreset.mosaics) throw new Error(`Network nemesis's mosaics must be found!`);

        const founderAccount = await this.keyStore.getNetworkAccount(networkType, 'founder', true);
        for (const node of input.nodes) {
            const metadata = nodesMetadata[node.nodeType];
            if (metadata.services) {
                continue;
            }
            const hostname = node.hostname;
            const nodeId = `node-${NetworkUtils.zeroPad(node.number, 3)}`;
            this.logger.info(`Generating transactions and balances for node ${nodeId} ${hostname}`);
            const nodeName = 'node';
            const mainAccount = await this.keyStore.getNodeAccount(networkType, KeyName.Main, nodeName, node, true);
            const vrfAccount = await this.keyStore.getNodeAccount(networkType, KeyName.VRF, nodeName, node, true);
            const remoteAccount = await this.keyStore.getNodeAccount(networkType, KeyName.Remote, nodeName, node, true);
            const roles: string[] = [];
            //Api,Peer,Voting
            if (metadata.api) {
                roles.push('Api');
            }
            if (metadata.peer) {
                roles.push('Peer');
            }
            if (metadata.voting) {
                roles.push('Voting');
            }
            const peerInfo: PeerInfo = {
                publicKey: mainAccount.publicKey,
                endpoint: {
                    host: node.hostname,
                    port: 7900,
                },
                metadata: {
                    name: node.friendlyName,
                    roles: roles.join(','),
                },
            };
            knownPeers.push(peerInfo);
            if (metadata.api) {
                knownRestGateways.push(NetworkUtils.resolveRestUrl(node.hostname, node.restProtocol));
            }

            nemesisPreset.mosaics.forEach((m, mosaicIndex) => {
                const nodeBalance = node.balances[mosaicIndex] || 0;
                if (nodeBalance) {
                    const divisibility = nemesisPreset.mosaics[mosaicIndex].divisibility;
                    if (divisibility == undefined) {
                        throw new Error('Divisibility should be defined!!');
                    }
                    nemesisBalances.push({
                        mosaicIndex: mosaicIndex,
                        address: mainAccount.address.plain(),
                        amount: nodeBalance * 10 ** divisibility,
                    });
                }
            });

            if (vrfAccount) {
                const transaction = VrfKeyLinkTransaction.create(deadline, vrfAccount.publicKey, LinkAction.Link, networkType);
                transactions.push({
                    nodeNumber: node.number,
                    type: 'VRF',
                    typeNumber: 1,
                    payload: mainAccount.sign(transaction, nemesisGenerationHashSeed).payload,
                });
            }

            if (remoteAccount) {
                const transaction = AccountKeyLinkTransaction.create(deadline, remoteAccount.publicKey, LinkAction.Link, networkType);
                transactions.push({
                    nodeNumber: node.number,
                    type: 'Remote',
                    typeNumber: 2,
                    payload: mainAccount.sign(transaction, nemesisGenerationHashSeed).payload,
                });
            }

            if (metadata.voting) {
                const votingKeyDesiredLifetime = node.customPreset?.votingKeyDesiredLifetime || networkPreset.votingKeyDesiredLifetime;
                if (!votingKeyDesiredLifetime) {
                    throw new Error('votingKeyDesiredLifetime must be resolved!');
                }

                const votingFileData = await this.keyStore.getVotingKeyFile(networkType, nodeName, node, 1, votingKeyDesiredLifetime);

                const transaction = VotingKeyLinkTransaction.create(
                    deadline,
                    votingFileData.publicKey,
                    votingFileData.startEpoch,
                    votingFileData.endEpoch,
                    LinkAction.Link,
                    networkType,
                    1,
                );
                transactions.push({
                    nodeNumber: node.number,
                    type: 'Voting',
                    typeNumber: 3,
                    payload: mainAccount.sign(transaction, nemesisGenerationHashSeed).payload,
                });
            }
        }
        const nemesisSigner = await this.keyStore.getNetworkAccount(networkType, 'nemesisSigner', false);
        networkPreset.knownPeers = knownPeers;
        networkPreset.knownRestGateways = knownRestGateways;
        await YamlUtils.writeYaml(join(this.workingDir, input.preset), networkPreset, undefined);
        this.logger.info('');
        this.logger.info(`The ${input.preset} file has been updated!`);
        this.logger.info('');
        const nemesisTransactions: Record<string, string> = _.mapValues(
            _.keyBy(transactions, (transaction) => NetworkUtils.getTransactionKey(transaction)),
            (transaction) => transaction.payload,
        );

        const faucetBalances = input.faucetBalances;
        const faucetAccount = faucetBalances ? await this.keyStore.getNetworkAccount(networkType, 'faucet', true) : undefined;
        if (faucetBalances && faucetAccount) {
            nemesisPreset.mosaics.forEach((m, mosaicIndex) => {
                const faucetBalance = input.faucetBalances?.[mosaicIndex];
                if (faucetBalance) {
                    const divisibility = nemesisPreset.mosaics[mosaicIndex].divisibility;
                    if (divisibility == undefined) {
                        throw new Error('Divisibility should be defined!!');
                    }
                    nemesisBalances.push({
                        mosaicIndex: mosaicIndex,
                        address: faucetAccount.address.plain(),
                        amount: faucetBalance * 10 ** divisibility,
                    });
                }
            });
        }

        const additionalCurrencyDistributions = input.additionalCurrencyDistributions;
        if (additionalCurrencyDistributions) {
            nemesisPreset.mosaics.forEach((m, mosaicIndex) => {
                const mosaicAdditionalCurrencyDistributions = additionalCurrencyDistributions[mosaicIndex];
                if (mosaicAdditionalCurrencyDistributions) {
                    const divisibility = nemesisPreset.mosaics[mosaicIndex].divisibility;
                    if (divisibility == undefined) {
                        throw new Error('Divisibility should be defined!!');
                    }
                    mosaicAdditionalCurrencyDistributions.forEach((distribution) => {
                        nemesisBalances.push({
                            mosaicIndex: mosaicIndex,
                            address: distribution.address,
                            amount: distribution.amount * 10 ** divisibility,
                        });
                    });
                }
            });
        }

        const nemesisCustomPreset: CustomPreset = {
            nemesisSeedFolder: '',
            nodes: [
                {
                    voting: false,
                    excludeFromNemesis: true, // Don't include this node links or balances!!!
                    friendlyName: 'nemesis-private-node',
                },
            ],
            nemesis: {
                nemesisSignerPrivateKey: nemesisSigner.privateKey,
                mosaics: nemesisPreset.mosaics.map((m, index) => ({
                    accounts: [founderAccount.publicKey],
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    currencyDistributions: nemesisBalances.filter((n) => n.mosaicIndex === index).map(({ mosaicIndex, ...rest }) => rest),
                })),
                transactions: nemesisTransactions,
            },
            faucets: [
                {
                    repeat: faucetAccount ? 1 : 0,
                    compose: {
                        environment: {
                            FAUCET_PRIVATE_KEY: faucetAccount?.privateKey,
                        },
                    },
                },
            ],
        };
        this.logger.info(`Generating nemesis block...`);
        this.logger.info('');
        const node = input.nodes.find(async (n) => {
            const metadata = nodesMetadata[n.nodeType];
            return metadata.harvesting;
        });
        if (!node) {
            throw new Error('No Candidate Node!!');
        }
        await service.config({
            user: Constants.CURRENT_USER,
            accountResolver: new NetworkAccountResolver(this.logger, node, this.keyStore),
            workingDir: this.workingDir,
            target: nemesisTargetFolder,
            preset: input.preset,
            password: password || undefined,
            offline: true,
            upgrade: false,
            reset: true,
            report: true,
            assembly: Assembly.demo,
            customPresetObject: nemesisCustomPreset,
        });
        await service.compose({
            offline: true,
            target: nemesisTargetFolder,
            user: composeUser || ConfigService.defaultParams.user,
            password: password || undefined,
            workingDir: this.workingDir,
            upgrade: true,
        });
        const nemesisSeedFolder = NetworkUtils.NEMESIS_SEED_FOLDER;
        await this.fileSystemService.copyDir(join(nemesisTargetFolder, 'nemesis', 'seed'), join(this.workingDir, nemesisSeedFolder));
        input.nemesisSeedFolder = nemesisSeedFolder;
        await NetworkUtils.saveNetwork(this.workingDir, CryptoUtils.removePrivateKeys(input));
        return nemesisTargetFolder;
    }
}
