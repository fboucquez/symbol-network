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

import * as _ from 'lodash';
import { join } from 'path';
import {
    BootstrapService,
    ConfigLoader,
    ConfigResult,
    ConfigService,
    Constants,
    CryptoUtils,
    CustomPreset,
    DeepPartial,
    FileSystemService,
    Logger,
    NodePreset,
    Password,
    PeerInfo,
    PrivateKeySecurityMode,
    YamlUtils,
    ZipUtils,
} from 'symbol-bootstrap';
import { NetworkType } from 'symbol-sdk';
import { KeyStore, NetworkAccountResolver, NetworkUtils, NetworkVotingKeyFileProvider } from '.';
import { NetworkFile, NodeInformation, NodeMetadataUtils, nodesMetadata, RestProtocol } from '../model';

export interface UpdateNodesParams {
    nodePassword: Password;
    offline: boolean;
    composeUser?: string;
    zip?: boolean;
}

export class NetworkConfigurationService {
    private readonly fileSystemService: FileSystemService;
    constructor(private readonly logger: Logger, private readonly workingDir: string, private readonly keyStore: KeyStore) {
        this.fileSystemService = new FileSystemService(logger);
    }

    public async expandNodes(): Promise<NetworkFile> {
        const input = await NetworkUtils.loadNetworkInput(this.workingDir);
        const { nodeTypes, ...rest } = input;
        const nodes: NodeInformation[] = [];
        let nodeCounter = 0;
        const counters: Record<string, number> = {};
        for (const nodeTypeInput of nodeTypes) {
            const { total, ...everythingElse } = nodeTypeInput;
            for (let index = 0; index < total; index++) {
                const nickname = nodeTypeInput.nickName;
                const regionIndex = 0;
                const counterIndex = nickname + regionIndex;
                counters[counterIndex] = (counters[counterIndex] || 0) + 1;
                const friendlyNamePattern = input.friendlyNamePattern || '$suffix-$nickname-$friendlyNumber';
                const nickNameNumber = counters[counterIndex];
                const friendlyNumber = regionIndex + NetworkUtils.zeroPad(nickNameNumber, 2);
                const suffix = input.suffix;
                const friendlyNamePatternData = {
                    suffix,
                    nickname,
                    friendlyNumber,
                };
                const friendlyName = Object.entries(friendlyNamePatternData).reduce(
                    (pattern, [key, value]) => pattern.replace(`$${key}`, value),
                    friendlyNamePattern,
                );

                const hostname = `${friendlyName}.${input.domain}`;
                const metadata = nodesMetadata[nodeTypeInput.nodeType];
                const assembly = NodeMetadataUtils.getAssembly(metadata);

                const customPreset: CustomPreset = {
                    privateKeySecurityMode: PrivateKeySecurityMode.PROMPT_MAIN_TRANSPORT,
                    nodes: [
                        {
                            friendlyName: friendlyName,
                            host: hostname,
                            voting: metadata.voting,
                            harvesting: metadata.harvesting,
                            dockerComposeDebugMode: false,
                            brokerDockerComposeDebugMode: false,
                        },
                    ],
                };
                if (metadata.api && nodeTypeInput.restProtocol == RestProtocol.HttpsOnly) {
                    customPreset.gateways = [
                        {
                            openPort: false,
                        },
                    ];
                    customPreset.httpsProxies = [
                        {
                            excludeDockerService: false,
                        },
                    ];
                }
                if (metadata.api && nodeTypeInput.restProtocol == RestProtocol.HttpAndHttps) {
                    customPreset.gateways = [
                        {
                            openPort: true,
                        },
                    ];
                    customPreset.httpsProxies = [
                        {
                            excludeDockerService: false,
                        },
                    ];
                }

                if (metadata.demo) {
                    const restUrl = NetworkUtils.resolveRestUrl(hostname, nodeTypeInput.restProtocol);
                    const explorerUrl = NetworkUtils.resolveExplorerUrl(hostname);
                    customPreset.faucets = [
                        {
                            compose: {
                                environment: {
                                    DEFAULT_NODE_CLIENT: restUrl,
                                    EXPLORER_URL: explorerUrl,
                                },
                            },
                        },
                    ];
                }

                const node = {
                    number: ++nodeCounter,
                    friendlyName: friendlyName,
                    assembly: assembly,
                    hostname: hostname,
                    customPreset: customPreset,
                    ...everythingElse,
                };
                nodes.push(node);
            }
        }

        if (nodes.length != _.uniqBy(nodes, (node) => node.friendlyName).length) {
            throw new Error('Duplicated friendlyNames!!');
        }
        if (nodes.length != _.uniqBy(nodes, (node) => node.hostname).length) {
            throw new Error('Duplicated hostname!!');
        }
        const output: NetworkFile = {
            ...rest,
            nodes: nodes,
        };
        await NetworkUtils.saveNetwork(this.workingDir, output);
        this.logger.info('');
        this.logger.info(`The ${NetworkUtils.NETWORK_FILE} has been saved!`);
        this.logger.info('');
        return output;
    }

    public async updateNodes({ nodePassword, offline, composeUser, zip }: UpdateNodesParams): Promise<void> {
        const input = await NetworkUtils.loadNetwork(this.workingDir);
        const networkPreset = ConfigLoader.loadNetworkPreset(input.preset, this.workingDir);
        const customNetwork = YamlUtils.isYmlFile(input.preset);
        if (customNetwork && !input.nemesisSeedFolder) {
            throw new Error('nemesisSeedFolder must be provided when creating nodes for a custom network!');
        }
        const service = new BootstrapService(this.logger);
        for (const node of input.nodes) {
            const hostname = node.hostname;
            this.logger.info('');
            this.logger.info(`Upgrading node ${node.number} ${hostname}`);
            this.logger.info('');
            const nodeFolder = join(this.workingDir, 'nodes', `node-${NetworkUtils.zeroPad(node.number, 3)}`);

            await this.fileSystemService.mkdir(nodeFolder);

            const toStoreCustomPreset = CryptoUtils.removePrivateKeys(node.customPreset) as CustomPreset;

            const nodeCustomPreset: DeepPartial<NodePreset> | undefined = toStoreCustomPreset?.nodes?.[0];
            if (!nodeCustomPreset) {
                throw new Error(`Node's custom preset cannot be found!`);
            }

            const metadata = nodesMetadata[node.nodeType];
            if (metadata.demo) {
                const faucetAccount = input.faucetBalances
                    ? await this.keyStore.getNetworkAccount(input.networkType, 'faucet', true)
                    : undefined;
                toStoreCustomPreset.faucets = [
                    _.merge(
                        {
                            repeat: faucetAccount ? 1 : 0,
                            privateKey: faucetAccount?.privateKey,
                        },
                        toStoreCustomPreset.faucets?.[0],
                    ),
                ];
            }

            if (input.nemesisSeedFolder) {
                const nodeNemesisSeedFolder = join(nodeFolder, input.nemesisSeedFolder);
                toStoreCustomPreset.nemesisSeedFolder = input.nemesisSeedFolder;
                await this.fileSystemService.copyDir(join(this.workingDir, input.nemesisSeedFolder), nodeNemesisSeedFolder);
            } else {
                // cleaning up if we swap from external to build in network preset.
                this.fileSystemService.deleteFolder(join(nodeFolder, NetworkUtils.NEMESIS_SEED_FOLDER));
            }

            const nodeCustomPresetFileName = 'custom-preset.yml';
            await YamlUtils.writeYaml(join(nodeFolder, nodeCustomPresetFileName), toStoreCustomPreset, undefined);
            const bootstrapTargetFolder = join(nodeFolder, 'target');
            if (YamlUtils.isYmlFile(input.preset)) {
                await YamlUtils.writeYaml(join(nodeFolder, NetworkUtils.NETWORK_PRESET_FILE), networkPreset, undefined);
            } else {
                this.fileSystemService.deleteFile(join(nodeFolder, NetworkUtils.NETWORK_PRESET_FILE));
            }
            const result: ConfigResult = await service.config({
                user: Constants.CURRENT_USER,
                workingDir: nodeFolder,
                target: bootstrapTargetFolder,
                report: false,
                preset: input.preset,
                reset: false,
                upgrade: true,
                offline: offline,
                assembly: node.assembly,
                password: nodePassword as string, // todo migrate password to Password in bootstrap.
                customPresetObject: toStoreCustomPreset,
                accountResolver: new NetworkAccountResolver(this.logger, node, this.keyStore),
                votingKeyFileProvider: this.createVotingKeyFileProvider(node),
            });

            await service.compose(
                {
                    user: composeUser || ConfigService.defaultParams.user,
                    target: bootstrapTargetFolder,
                    upgrade: true,
                    workingDir: this.workingDir,
                    password: nodePassword as string,
                },
                result.presetData,
                result.addresses,
            );
            const nodeAddresses = result.addresses.nodes?.[0];
            if (!nodeAddresses) {
                throw new Error('Node addresses should have been resolved!!!');
            }
            node.addresses = nodeAddresses;
            if (zip) {
                const zipName = `${hostname}.zip`;
                const zipDir = `${this.workingDir}/distribution`;
                await this.fileSystemService.mkdir(zipDir);
                await this.fileSystemService.mkdir(zipDir);
                const localZipFilePath = join(zipDir, zipName);
                await new ZipUtils(this.logger).zip(localZipFilePath, [
                    {
                        from: nodeFolder,
                        to: '',
                        directory: true,
                    },
                ]);
            }
        }

        await NetworkUtils.saveNetwork(this.workingDir, input);
        this.logger.info('');
        this.logger.info(`The ${NetworkUtils.NETWORK_FILE} file has been updated!`);
        this.logger.info('');
        this.logger.info(`Nodes have been created/upgraded. `);
        this.logger.info('');
    }

    private createVotingKeyFileProvider(node: NodeInformation) {
        return new NetworkVotingKeyFileProvider(node, this.keyStore);
    }

    public async updateNetworkPreset(
        preset: string,
        networkInput: {
            networkType: NetworkType;
            knownRestGateways?: string[];
            knownPeers?: PeerInfo[];
            customNetworkPreset?: CustomPreset;
        },
        saveAsFile: string,
    ): Promise<CustomPreset> {
        const keyStore = this.keyStore;
        const networkPreset = ConfigLoader.loadNetworkPreset(preset, this.workingDir);
        const networkType = networkInput.networkType;
        const nemesisSignerAccount = await keyStore.getNetworkAccount(networkType, 'nemesisSigner', true);
        const harvestNetworkFeeSinkAccount = await keyStore.getNetworkAccount(networkType, 'harvestNetworkFeeSink', true);
        const namespaceRentalFeeSinkAccount = await keyStore.getNetworkAccount(networkType, 'namespaceRentalFeeSink', true);
        const mosaicRentalFeeSinkAccount = await keyStore.getNetworkAccount(networkType, 'mosaicRentalFeeSink', true);
        delete networkPreset.currencyMosaicId;
        delete networkPreset.harvestingMosaicId;
        delete networkPreset.currencyMosaicId;
        delete networkPreset.harvestingMosaicId;
        delete networkPreset.statisticsServiceUrl;
        delete networkPreset.harvestNetworkFeeSinkAddressV1;
        delete networkPreset.mosaicRentalFeeSinkAddressV1;
        delete networkPreset.namespaceRentalFeeSinkAddressV1;
        networkPreset.nemesisSeedFolder = NetworkUtils.NEMESIS_SEED_FOLDER;
        networkPreset.lastKnownNetworkEpoch = 1;
        networkPreset.networkType = networkType;
        networkPreset.nemesisSignerPublicKey = nemesisSignerAccount.publicKey;
        networkPreset.harvestNetworkFeeSinkAddress = harvestNetworkFeeSinkAccount.address.plain();
        networkPreset.namespaceRentalFeeSinkAddress = namespaceRentalFeeSinkAccount.address.plain();
        networkPreset.mosaicRentalFeeSinkAddress = mosaicRentalFeeSinkAccount.address.plain();
        networkPreset.knownRestGateways = networkInput.knownRestGateways;
        networkPreset.knownPeers = networkInput.knownPeers;
        const configLoader = new ConfigLoader(this.logger);
        const toStoreNetworkPreset = configLoader.mergePresets(networkPreset, networkInput.customNetworkPreset);
        await YamlUtils.writeYaml(join(this.workingDir, saveAsFile), toStoreNetworkPreset, undefined);
        return toStoreNetworkPreset;
    }
}
