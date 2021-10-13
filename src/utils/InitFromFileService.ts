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

import { CustomPreset, Logger, LoggerFactory, LogType } from 'symbol-bootstrap';
import { Account } from 'symbol-sdk';
import { InitServiceParams, NetworkConfigurationService, NetworkInputFile, NetworkUtils } from '../';
import { NetworkCommandUtils } from './';

export class InitFromFileService {
    constructor(private readonly logger: Logger, private readonly workingDir: string, private readonly params: InitServiceParams) {}
    async execute(): Promise<void> {
        const networkInputFile = NetworkUtils.NETWORK_INPUT_FILE;

        const logger = LoggerFactory.getLogger(LogType.Console);

        console.log();
        console.log(`Welcome to the ${NetworkCommandUtils.CLI_TOOL} tool. `);
        console.log();
        console.log('This tool will allow you creating a new network or a node cluster for an existing network.');
        console.log();
        console.log('The init.yml file has been provided. Cli will automatically generate the required information.');
        console.log();

        const networkInput: NetworkInputFile = await NetworkUtils.loadNetworkInput(this.workingDir);

        const isNewNetwork = networkInput.isNewNetwork;
        const preset = networkInput.cloneFromPreset || networkInput.preset;
        if (!preset) {
            throw new Error('Preset could not be resolved from the input file!');
        }
        if (!networkInput.preset) {
            networkInput.preset = NetworkUtils.NETWORK_PRESET_FILE;
        }
        if (isNewNetwork) {
            const customNetworkPreset: CustomPreset = networkInput.customNetworkPreset || {};
            if (!customNetworkPreset.epochAdjustment) {
                customNetworkPreset.epochAdjustment = `${NetworkUtils.getCurrentNetworkAdjustment()}s`;
            }
            if (!customNetworkPreset.nemesisGenerationHashSeed) {
                customNetworkPreset.nemesisGenerationHashSeed = Account.generateNewAccount(networkInput.networkType).privateKey;
            }
            networkInput.customNetworkPreset = customNetworkPreset;
            const keyStore = await NetworkCommandUtils.createStore(this.params, logger, false, this.workingDir);
            const { networkType, faucetBalances } = networkInput;
            await keyStore.getNetworkAccount(networkType, 'nemesisSigner', true);
            await keyStore.getNetworkAccount(networkType, 'founder', true);
            await keyStore.getNetworkAccount(networkType, 'faucet', true);
            await keyStore.getNetworkAccount(networkType, 'harvestNetworkFeeSink', true);
            await keyStore.getNetworkAccount(networkType, 'namespaceRentalFeeSink', true);
            if (faucetBalances?.length) {
                await keyStore.getNetworkAccount(networkType, 'mosaicRentalFeeSink', true);
            }
            const customNetworkPresetFile = NetworkUtils.NETWORK_PRESET_FILE;
            await new NetworkConfigurationService(this.logger, this.workingDir, keyStore).updateNetworkPreset(
                preset,
                networkInput,
                customNetworkPresetFile,
            );
            console.log();
            console.log(
                `The initial network preset ${customNetworkPresetFile} for the new network has been stored. This file will be updated in the following steps.`,
            );
            console.log();
        }

        await NetworkUtils.saveNetworkInput(this.workingDir, networkInput);
        console.log();
        console.log(`You have created the initial ${networkInputFile}. Have a look and once once you are happy, run: `);
        console.log();
        console.log(`$ ${NetworkCommandUtils.CLI_TOOL} expandNodes`);
        console.log();
    }
}
