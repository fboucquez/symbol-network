import { NetworkType } from 'symbol-sdk';

export enum Network {
    testnet = 'testnet',
    mainnet = 'mainnet',
}

export const toNetworkType = (network: Network): NetworkType => {
    switch (network) {
        case Network.testnet: {
            return NetworkType.TEST_NET;
        }
        case Network.mainnet: {
            return NetworkType.MAIN_NET;
        }
    }
    throw new Error(`Invalid network ${network}!!!`);
};

export const toDescription = (network: Network): string => {
    switch (network) {
        case Network.testnet: {
            return 'Testnet';
        }
        case Network.mainnet: {
            return 'Mainnet';
        }
    }
    throw new Error(`Invalid network ${network}!!!`);
};
