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

import { expect } from 'chai';
import { existsSync } from 'fs';
import 'mocha';
import { join } from 'path';
import { stub } from 'sinon';
import { FileSystemService, LoggerFactory, LogType, VotingUtils, YamlUtils } from 'symbol-bootstrap';
import { Account, Convert } from 'symbol-sdk';
import { LocalFileKeyStore, NetworkService, NetworkUtils } from '../../src';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { TestUtils } from './TestUtils';

const testFolder = 'target';
const logger = LoggerFactory.getLogger(LogType.Silent);
const fileSystemService = new FileSystemService(logger);

describe('NetworkService', () => {
    const networkGeneration = async (name: string, fullComparison: boolean) => {
        const fromTestFolder = join('test', 'networkExamples', name, 'input');
        const fromExpectedFolder = join('test', 'networkExamples', name, 'expected');
        const targetFolder = join(testFolder, name);
        await fileSystemService.deleteFolder(targetFolder);
        expect(existsSync(fromTestFolder)).eq(true);
        await fileSystemService.copyDir(fromTestFolder, targetFolder);
        const service = new NetworkService(logger, targetFolder);
        const keyStore = new LocalFileKeyStore(undefined, true, targetFolder);
        let counter = 0;

        const createVotingKeyFile = (
            votingUtils: VotingUtils,
            votingAccount: Account,
            nodeName: string,
            votingFile: { endEpoch: number; publicKey: string; startEpoch: number },
        ): Promise<Uint8Array> => {
            const privateKeySuffix = Convert.utf8ToHex(nodeName);
            const unitTestPrivateKeys: Uint8Array[] = [];
            for (let i = votingFile.startEpoch; i < votingFile.endEpoch + 1; i++) {
                unitTestPrivateKeys.push(Convert.hexToUint8(TestUtils.toKey(i + privateKeySuffix)));
            }
            return votingUtils.createVotingFile(votingAccount.privateKey, votingFile.startEpoch, votingFile.endEpoch, unitTestPrivateKeys);
        };

        stub(keyStore, <any>'generateNewAccount').callsFake((generate, networkType) => {
            return Account.createFromPrivateKey(TestUtils.toKey((counter++).toString()), networkType);
        });
        stub(keyStore, <any>'createVotingKeyFile').callsFake(createVotingKeyFile);
        await service.expandNodes(keyStore);
        await service.generateNemesis(keyStore, {
            regenerate: false,
            composeUser: '1000:1000',
            password: false,
        });
        await service.updateNodes(keyStore, {
            offline: true,
            nodePassword: undefined,
            composeUser: '1000:1000',
        });
        if (fullComparison) {
            await TestUtils.compareDirectories(logger, fromExpectedFolder, targetFolder);
        } else {
            const expectSameFile = async (fileName: string) => {
                const generatedNetworkFile = await YamlUtils.loadYaml(join(targetFolder, fileName), undefined);
                const expectedNetworkFile = await YamlUtils.loadYaml(join(fromExpectedFolder, fileName), undefined);
                expect(generatedNetworkFile).deep.eq(expectedNetworkFile);
            };
            await expectSameFile(NetworkUtils.NETWORK_FILE);
            await expectSameFile(NetworkUtils.NETWORK_PRESET_FILE);
            await expectSameFile(NetworkUtils.KEY_STORE_FILE);
        }
    };

    it('network1 generation', async () => {
        await networkGeneration('network1', false);
    });

    it('network2 generation', async () => {
        await networkGeneration('network2', true);
    });
});
