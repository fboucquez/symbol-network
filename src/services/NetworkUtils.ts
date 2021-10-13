/*
 * Copyright 2021 NEM
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
import fetch from 'node-fetch';
import { join } from 'path';
import { BootstrapUtils, CryptoUtils } from 'symbol-bootstrap';
import { RepositoryFactory, RepositoryFactoryHttp } from 'symbol-sdk';
import { NetworkFile, NetworkInputFile, RestProtocol, TransactionInformation } from '../model';

export class NetworkUtils {
    public static readonly NETWORK_INPUT_FILE = 'network-input.yml';
    public static readonly NETWORK_FILE = 'network.yml';
    public static readonly NETWORK_PRESET_FILE = 'custom-network-preset.yml';
    public static readonly KEY_STORE_FILE = 'key-store.yml';
    public static readonly NEMESIS_SEED_FOLDER = 'nemesis-seed';

    public static capitalizeFirstLetter(string: string): string {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
    public static zeroPad(num: number, places: number): string {
        return String(num).padStart(places, '0');
    }

    public static getTransactionKey(transaction: TransactionInformation): string {
        return `${transaction.typeNumber}_${transaction.type}_${this.zeroPad(transaction.nodeNumber, 5)}`;
    }

    public static startCase(s: string): string {
        return _.startCase(s);
    }

    public static async loadNetworkInput(workingDir: string): Promise<NetworkInputFile> {
        const inputFile = join(workingDir, this.NETWORK_INPUT_FILE);
        if (!existsSync(inputFile)) {
            throw new Error(`Input File ${inputFile} does not exist`);
        }
        const input = (await BootstrapUtils.loadYaml(inputFile, undefined)) as NetworkInputFile;
        //Add validation;
        return input;
    }

    public static async loadNetwork(workingDir: string): Promise<NetworkFile> {
        const inputFile = join(workingDir, this.NETWORK_FILE);
        if (!existsSync(inputFile)) {
            throw new Error(`Input File ${inputFile} does not exist`);
        }
        const input = (await BootstrapUtils.loadYaml(inputFile, undefined)) as NetworkFile;
        //Add validation;
        return input;
    }

    public static async saveNetwork(workingDir: string, network: NetworkFile): Promise<void> {
        const outputFile = join(workingDir, this.NETWORK_FILE);
        await BootstrapUtils.writeYaml(outputFile, CryptoUtils.removePrivateKeys(network), undefined);
    }

    public static async saveNetworkInput(workingDir: string, network: NetworkInputFile): Promise<void> {
        NetworkUtils.validateNetworkInput(network);
        const outputFile = join(workingDir, this.NETWORK_INPUT_FILE);
        await BootstrapUtils.writeYaml(outputFile, CryptoUtils.removePrivateKeys(network), undefined);
    }

    public static validateNetworkInput(network: Partial<NetworkInputFile>): NetworkInputFile {
        if (!network.networkType) {
            throw new Error('networkType must be resolved!');
        }
        if (network.isNewNetwork) {
            if (!network.customNetworkPreset) {
                throw new Error('customNetworkPreset must be resolved!');
            }
            if (!network.customNetworkPreset.epochAdjustment) {
                throw new Error('customNetworkPreset.epochAdjustment must be resolved!');
            }
            if (!network.customNetworkPreset.nemesisGenerationHashSeed) {
                throw new Error('customNetworkPreset.nemesisGenerationHashSeed must be resolved!');
            }
            if (!network.customNetworkPreset.networkDescription) {
                throw new Error('customNetworkPreset.networkDescription must be resolved!');
            }
            if (!network.customNetworkPreset.nemesis) {
                throw new Error('customNetworkPreset.nemesis must be resolved!');
            }
            if (!network.customNetworkPreset.nemesis.mosaics) {
                throw new Error('customNetworkPreset.nemesis.mosaics must be resolved!');
            }
        }

        return network as NetworkInputFile;
    }

    public static resolveRestUrl(hostname: string, restProtocol: RestProtocol | undefined): string {
        return restProtocol == RestProtocol.HttpOnly ? `http://${hostname}:3000` : `https://${hostname}:3001`;
    }

    public static resolveExplorerUrl(hostname: string): string {
        return `http://${hostname}:90`;
    }

    public static resolveWalletUrl(hostname: string): string {
        return `http://${hostname}`;
    }

    public static resolveFaucetUrl(hostname: string): string {
        return `http://${hostname}:100`;
    }

    public static createRepositoryFactory(url: string, timeout: number | undefined): RepositoryFactory {
        const repositoryFactory = new RepositoryFactoryHttp(url, {
            fetchApi: NetworkUtils.fetchWithTimeout(timeout),
        });
        return repositoryFactory;
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public static fetchWithTimeout = (timeout: number | undefined) => {
        if (timeout === undefined) {
            return fetch;
        } else {
            return async (resource: any, options: any): Promise<any> => {
                options.timeout = timeout;
                return fetch(resource, {
                    ...options,
                    timeout,
                });
            };
        }
    };

    public static getCurrentNetworkAdjustment(): number {
        return Math.floor(Date.now() / 1000);
    }
}
