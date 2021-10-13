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
import { prompt } from 'inquirer';
import * as _ from 'lodash';
import {
    CommandUtils,
    ConfigLoader,
    CustomPreset,
    FileSystemService,
    Logger,
    LoggerFactory,
    LogType,
    NemesisPreset,
    Preset,
    YamlUtils,
} from 'symbol-bootstrap';
import { Account, NetworkType } from 'symbol-sdk';
import {
    Network,
    NetworkConfigurationService,
    NetworkInputFile,
    NetworkUtils,
    NodeMetadataType,
    nodesMetadata,
    NodeTypeInput,
    RestProtocol,
    toDescription,
    toNetworkType,
} from '../';
import { NetworkCommandUtils } from './';

export interface InitServiceParams {
    readonly ready: boolean;
    readonly showPrivateKeys: boolean;
    readonly password?: string;
    readonly noPassword: boolean;
    readonly additionalNetworkPreset?: CustomPreset; //FOR TEST!
}

export class InitService {
    constructor(private readonly logger: Logger, private readonly workingDir: string, private readonly params: InitServiceParams) {}
    async execute(): Promise<void> {
        const networkInputFile = NetworkUtils.NETWORK_INPUT_FILE;
        const customNetworkPresetFile = NetworkUtils.NETWORK_PRESET_FILE;
        const logger = LoggerFactory.getLogger(LogType.Console);

        console.log();
        console.log(`Welcome to the ${NetworkCommandUtils.CLI_TOOL} tool. `);
        console.log();
        console.log('This tool will allow you creating a new network or a node cluster for an existing network.');

        console.log();
        console.log('First you need to decide if you are creating a new network or creating nodes to join an existing network.');
        console.log();

        const isNewNetwork = await this.confirm('Are you creating a new network?');
        if (isNewNetwork) {
            console.log();
            console.log(
                'The new network will be based on an existing network. You can select an out-of-the box preset from Symbol Bootstrap or you can provide a custom network preset to be based one',
            );
            console.log();
        } else {
            console.log();
            console.log('The new nodes can join an existing public network or you can provide the custom network`s preset and seed.');
            console.log();
        }

        const { preset, nemesisSeedFolder } = await this.promptPreset(isNewNetwork);

        const domain = await this.promptDomain('Domain', 'Enter the domain to be used to be used in your nodes', 'mycompany.com');

        const suffix = await this.promptName('Suffix', `Enter a suffix for node generated domain names and urls`, 'myc');
        const friendlyNamePattern = await this.promptTemplate(
            'friendlyNamePattern',
            `Enter the pattern used to generate hostnames and friendly names`,
            '$suffix-$nickname-$friendlyNumber',
        );

        const networkPreset = ConfigLoader.loadNetworkPreset(preset, this.workingDir);
        const nemesisPreset = networkPreset.nemesis as NemesisPreset;
        if (!nemesisPreset) throw new Error('Network nemesis must be found!');
        if (!nemesisPreset.mosaics) throw new Error(`Network nemesis's mosaics must be found!`);
        let faucetBalances: number[] | undefined;
        let customNetworkPreset: CustomPreset | undefined = {};
        if (isNewNetwork) {
            customNetworkPreset = _.merge({ nemesis: { mosaics: [] } }, this.params.additionalNetworkPreset);
            const keyStore = await NetworkCommandUtils.createStore(this.params, logger, false, this.workingDir);
            const network = await this.promptNetwork("What's the network type you want to create?", Network.testnet);
            const networkType = await toNetworkType(network);
            customNetworkPreset.networkDescription = await this.promptDescription(
                'Network Name',
                `Enter a name for the network.`,
                `My Company ${toDescription(network)} Network`,
            );

            customNetworkPreset.nemesisGenerationHashSeed = await this.generateRandomKey(
                'Generation Hash Seed',
                'Enter the generation hash seed to identify the network',
                networkType,
            );

            customNetworkPreset.epochAdjustment = `${await this.promptNumber(
                'Epoch Adjustment',
                'Enter the epoch adjustment value to offset deadlines.',
                NetworkUtils.getCurrentNetworkAdjustment(),
            )}s`;

            customNetworkPreset.baseNamespace = await this.promptName(
                'Network basename Alias',
                'Enter the basename for the network aliases',
                networkPreset.baseNamespace,
            );

            for (const [index, mosaic] of nemesisPreset.mosaics.entries()) {
                const currencyType = index == 0 ? 'Network' : index == 1 ? 'Harvest' : 'Custom';
                const name = await this.promptName(
                    `${currencyType} Currency Name`,
                    `Enter the alias for the ${currencyType} Currency`,
                    mosaic.name,
                );
                customNetworkPreset.nemesis!.mosaics!.push({
                    name,
                });
            }

            const nemesisSignerAccount = await this.promptPrivateKey(networkType, 'Nemesis Signer Account');
            await keyStore.saveNetworkAccount(networkType, 'nemesisSigner', nemesisSignerAccount.privateKey);

            const founderAccount = await this.promptPrivateKey(networkType, 'Founder Account');
            await keyStore.saveNetworkAccount(networkType, 'founder', founderAccount.privateKey);
            faucetBalances = [];
            if (await this.confirm('Do you want to have a Faucet account?')) {
                const faucetAccount = await this.promptPrivateKey(networkType, 'Faucet Account');
                await keyStore.saveNetworkAccount(networkType, 'faucet', faucetAccount.privateKey);
                for (const mosaic of nemesisPreset.mosaics) {
                    const balance = await this.promptNumber(
                        'Balance',
                        `What's the initial ${mosaic.name} balance for the Faucet Account ${faucetAccount.address.plain()}?`,
                        Math.floor(mosaic.supply / 100 / Math.pow(10, mosaic.divisibility)) * 5,
                    );
                    faucetBalances.push(balance);
                }
            }

            const harvestNetworkFeeSinkAccount = await this.promptPrivateKey(networkType, 'Harvest Network Fee Sink Account');
            await keyStore.saveNetworkAccount(networkType, 'harvestNetworkFeeSink', harvestNetworkFeeSinkAccount.privateKey);

            const namespaceRentalFeeSinkAccount = await this.promptPrivateKey(networkType, 'Namespace Rental Fee Sink Account');
            await keyStore.saveNetworkAccount(networkType, 'namespaceRentalFeeSink', namespaceRentalFeeSinkAccount.privateKey);

            const mosaicRentalFeeSinkAccount = await this.promptPrivateKey(networkType, 'Mosaic Rental Fee Sink Account');
            await keyStore.saveNetworkAccount(networkType, 'mosaicRentalFeeSink', mosaicRentalFeeSinkAccount.privateKey);

            await new NetworkConfigurationService(this.logger, this.workingDir, keyStore).updateNetworkPreset(
                preset,
                {
                    networkType,
                    customNetworkPreset,
                },
                customNetworkPresetFile,
            );

            console.log();
            console.log(
                `The initial network preset ${customNetworkPresetFile} for the new network has been stored. This file will be updated in the following steps.`,
            );
            console.log();
        }

        const nodeTypes = await this.promptNodeTypeInputList(nemesisPreset);
        const networkType = networkPreset.networkType;
        const networkInput: NetworkInputFile = {
            preset: isNewNetwork ? customNetworkPresetFile : preset,
            cloneFromPreset: isNewNetwork ? preset : undefined,
            domain: domain,
            suffix: suffix,
            friendlyNamePattern: friendlyNamePattern,
            networkType: networkType!,
            isNewNetwork: isNewNetwork,
            faucetBalances: faucetBalances,
            nemesisSeedFolder: nemesisSeedFolder,
            nodeTypes: nodeTypes,
            customNetworkPreset: customNetworkPreset,
        };

        await NetworkUtils.saveNetworkInput(this.workingDir, networkInput);
        console.log();
        console.log(`You have created the initial ${networkInputFile}. Have a look and once once you are happy, run: `);
        console.log();
        console.log(`$ ${NetworkCommandUtils.CLI_TOOL} expandNodes`);
        console.log();
    }

    public async confirm(question: string, defaultValue = true): Promise<boolean> {
        const { value } = await prompt([
            {
                name: 'value',
                message: question,
                type: 'confirm',
                default: defaultValue,
            },
        ]);
        return value;
    }

    public async promptPreset(isNewNetwork: boolean): Promise<{ preset: string; nemesisSeedFolder?: string }> {
        const message = isNewNetwork
            ? 'Select the Bootstrap profile to base your new network from:'
            : 'Select the Bootstrap profile for your nodes:';
        let preset: string = Preset.mainnet;
        let customFile = NetworkUtils.NETWORK_PRESET_FILE;
        let nemesisSeedFolder = 'nemesis-seed';
        while (true) {
            const choices = (isNewNetwork ? Object.values(Preset) : [Preset.testnet, Preset.mainnet]).map((e) => {
                return {
                    name: `${NetworkUtils.startCase(e)} Preset`,
                    value: e.toString(),
                };
            });
            choices.push({
                name: `Custom Preset (${customFile} file will be asked)`,
                value: 'custom',
            });
            const networkResponse = await prompt([
                {
                    name: 'value',
                    message: message,
                    type: 'list',
                    default: preset,
                    choices: choices,
                },
            ]);
            preset = networkResponse.value;
            if (preset === 'custom') {
                const customPresetResponse = await prompt([
                    {
                        name: 'value',
                        message: "Enter the filename of the the custom network's preset:",
                        default: customFile,
                        validate(input: string): boolean | string {
                            if (!YamlUtils.isYmlFile(input)) {
                                return 'is not a YAML file';
                            }
                            return true;
                        },
                        type: 'input',
                    },
                ]);

                customFile = customPresetResponse.value;
                if (!existsSync(customFile)) {
                    console.log();
                    console.log(`Network file '${customFile}' does not exist! Please re-enter`);
                    console.log();
                    continue;
                }
                if (isNewNetwork) {
                    return { preset: customFile };
                }
                const nemesisSeedFolderResponse = await prompt([
                    {
                        name: 'value',
                        message: 'Enter the folder name where the custom network seed can be found:',
                        default: nemesisSeedFolder,
                        type: 'input',
                    },
                ]);
                nemesisSeedFolder = nemesisSeedFolderResponse.value;
                try {
                    await new FileSystemService(this.logger).validateSeedFolder(nemesisSeedFolder, '');
                } catch (e) {
                    console.log();
                    console.log(
                        `Network nemesis seed '${nemesisSeedFolder}' is not valid! Please re-enter: Error: ${NetworkUtils.getMessage(e)}`,
                    );
                    console.log();
                    continue;
                }
                return {
                    preset: customFile,
                    nemesisSeedFolder: nemesisSeedFolder,
                };
            }
            return { preset: preset };
        }
    }

    public async promptNetwork(message: string, defaultNetwork: Network): Promise<Network> {
        const responses = await prompt([
            {
                name: 'network',
                message: message,
                type: 'list',
                default: defaultNetwork,
                choices: Object.values(Network).map((e) => {
                    return {
                        name: toDescription(e),
                        value: e,
                    };
                }),
            },
        ]);
        return responses.network;
    }

    public async promptRestProtocol(): Promise<RestProtocol> {
        const responses = await prompt([
            {
                name: 'value',
                message: 'Select the HTTP protocol for your Rest Gateways',
                type: 'list',
                default: RestProtocol.HttpsOnly,
                choices: Object.values(RestProtocol).map((e) => {
                    return {
                        name: e,
                        value: e,
                    };
                }),
            },
        ]);
        return responses.value;
    }

    public async promptNodeTypeInputList(nemesis: NemesisPreset): Promise<NodeTypeInput[]> {
        const list: NodeTypeInput[] = [];
        while (true) {
            console.log();
            console.log();
            const nodeType = await this.promptNodeType(`Select the node type you want to create`);
            const nodeTypeName = nodesMetadata[nodeType].name;
            const { total } = await prompt([
                {
                    name: 'total',
                    message: `How many nodes of type ${nodeTypeName} do you want to create?`,
                    type: 'number',
                    validate: (input) => {
                        if (!input) {
                            return 'is required';
                        }
                        if (input < 0) {
                            return 'number must not be negative';
                        }
                        return true;
                    },
                    default: 3,
                },
            ]);

            const balances: number[] = [];
            if (!nemesis) {
                throw new Error('Nemesis must be resolved!');
            }
            for (const [index, mosaic] of nemesis.mosaics.entries()) {
                const balance = await this.promptNumber(
                    'Balance',
                    `What's the initial ${mosaic.name} balance for the ${nodeTypeName} nodes?`,
                    nodesMetadata[nodeType].balances[index],
                );
                balances.push(balance);
            }

            const nickName = await this.promptName(
                `Nodes's Nick Name`,
                'The nick name of the these nodes',
                nodesMetadata[nodeType].nickName,
            );

            const restProtocol = nodesMetadata[nodeType].api ? await this.promptRestProtocol() : undefined;
            const { confirmCreate } = await prompt([
                {
                    default: true,
                    message: `Do you want to create ${total} nodes of type ${nodeTypeName} each with balance of ${balances.join(', ')}?`,
                    type: 'confirm',
                    name: 'confirmCreate',
                },
            ]);
            if (confirmCreate) {
                list.push({
                    nickName: nickName,
                    nodeType: nodeType,
                    balances: balances,
                    total: total,
                    restProtocol: restProtocol,
                });
            }
            const { confirmCreateMore } = await prompt([
                {
                    default: true,
                    message: `Do you want to create more nodes?`,
                    type: 'confirm',
                    name: 'confirmCreateMore',
                },
            ]);
            if (!confirmCreateMore) {
                return list;
            }
        }
    }

    public async promptNodeType(message: string): Promise<NodeMetadataType> {
        const responses = await prompt([
            {
                name: 'value',
                message: message,
                type: 'list',
                choices: Object.values(NodeMetadataType).map((e) => {
                    return {
                        name: nodesMetadata[e].name,
                        value: e,
                    };
                }),
            },
        ]);
        return responses.value;
    }

    public async promptPrivateKey(networkType: NetworkType, fieldName: string): Promise<Account> {
        const showPrivateKeys = this.params.showPrivateKeys;
        return this.confirmedPrompt<Account>(
            fieldName,
            async (currentValue): Promise<Account> => {
                const { value } = await prompt([
                    {
                        name: 'value',
                        message: `Enter the 64 HEX private key ${fieldName} (or press enter to accept the auto generated):`,
                        type: showPrivateKeys ? 'input' : 'password',
                        mask: showPrivateKeys ? '' : '*',
                        default: currentValue?.privateKey,
                        validate: CommandUtils.isValidPrivateKey,
                    },
                ]);
                return Account.createFromPrivateKey(value, networkType);
            },
            Account.generateNewAccount(networkType),
            (enteredAccount) => `address ${enteredAccount.address.plain()} public key ${enteredAccount.publicKey}`,
        );
    }

    public async generateRandomKey(fieldName: string, message: string, networkType: NetworkType): Promise<string> {
        return this.promptText(fieldName, message, Account.generateNewAccount(networkType).privateKey, CommandUtils.isValidPrivateKey);
    }
    public async promptName(fieldName: string, message: string, defaultValue: string | undefined): Promise<string> {
        return this.promptText(fieldName, message, defaultValue, this.isValidName);
    }

    public async promptTemplate(fieldName: string, message: string, defaultValue: string | undefined): Promise<string> {
        return this.promptText(fieldName, message, defaultValue, this.isValidTemplate);
    }

    public async promptDescription(fieldName: string, message: string, defaultValue: string | undefined): Promise<string> {
        return this.promptText(fieldName, message, defaultValue, this.isValidDescription);
    }

    public async promptDomain(fieldName: string, message: string, defaultValue: string | undefined): Promise<string> {
        return this.promptText(fieldName, message, defaultValue, this.isValidDomain);
    }

    public async promptNumber(fieldName: string, message: string, defaultValue: number | undefined): Promise<number> {
        return this.confirmedPrompt(
            fieldName,
            async (currentValue) => {
                const { value } = await prompt([
                    {
                        name: 'value',
                        message: message,
                        type: 'number',
                        default: currentValue,
                        validate(input: any): boolean | string {
                            if (input === undefined) {
                                return 'is required';
                            }
                            if (input < 0) {
                                return 'must not be negative';
                            }
                            return true;
                        },
                    },
                ]);
                return value;
            },
            defaultValue,
        );
    }

    public async promptUrl(fieldName: string, message: string, defaultValue: string | undefined): Promise<string> {
        return this.promptText(fieldName, message, defaultValue, this.isValidUrl);
    }

    public async promptText(
        fieldName: string,
        message: string,
        defaultValue: string | undefined,

        validate?: (input: any) => boolean | string | Promise<boolean | string>,
    ): Promise<string> {
        return this.confirmedPrompt(
            fieldName,
            async (currentValue) => {
                const { value } = await prompt([
                    {
                        name: 'value',
                        message: message,
                        type: 'input',
                        default: currentValue,
                        validate: validate,
                    },
                ]);
                return value;
            },
            defaultValue,
        );
    }

    public async confirmedPrompt<T>(
        fieldName: string,
        valuePrompt: (defaultValue: T | undefined) => Promise<T>,
        defaultValue: T | undefined,
        toString: (o: T) => string = (o: T) => `${o}`,
    ): Promise<T> {
        let value = defaultValue;
        while (true) {
            value = await valuePrompt(value);
            if (this.params.ready) {
                return value;
            }
            const { confirm } = await prompt([
                {
                    default: true,
                    message: `Is the ${fieldName} ${toString(value)} correct?`,
                    type: 'confirm',
                    name: 'confirm',
                },
            ]);
            if (confirm) {
                return value;
            }
            console.log(`Please re-enter the ${fieldName}.`);
        }
    }

    public isValidName(input: string): boolean | string {
        if (!input) {
            return 'Must be provided';
        }
        if (input.match(/^[A-Za-z]+$/)) return true;
        else {
            return `${input} is not a valid name`;
        }
    }

    public isValidTemplate(input: string): boolean | string {
        if (!input) {
            return 'Must be provided';
        }
        if (input.match(/^[A-Za-z\$\-\d]+$/)) return true;
        else {
            return `${input} is not a valid name`;
        }
    }

    public isValidDescription(input: string): boolean | string {
        if (!input) {
            return 'Must be provided';
        }
        if (input.match(/^[a-z\d\-_\s]+$/i)) return true;
        else {
            return `${input} is not a valid description text`;
        }
    }

    public isValidDomain(input: string): boolean | string {
        const expression = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;

        if (!input) {
            return 'Must be provided';
        }
        if (input.match(expression)) return true;
        else {
            return `${input} is not a valid domain`;
        }
    }

    public isValidUrl(input: string): boolean | string {
        const expression =
            /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/gi;

        if (!input) {
            return 'Must be provided';
        }
        if (input.match(expression)) return true;
        else {
            return `${input} is not a valid url`;
        }
    }
}
