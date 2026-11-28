import { requireOptionalNativeModule } from 'expo';
import { loadNativeAuthCipher, loadNativeSecretStore } from '@/lib/authStorageNative';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));
const optional = requireOptionalNativeModule as jest.Mock;

describe('authStorageNative', () => {
  beforeEach(() => optional.mockReset());

  it('ohne natives SecureStore (Builds bis iOS 60 / Android 53) → null, also bisheriger Speicher', () => {
    optional.mockReturnValue(null);
    expect(loadNativeSecretStore()).toBeNull();
    expect(optional).toHaveBeenCalledWith('ExpoSecureStore');
  });

  it('ohne natives AES-Modul → null', () => {
    optional.mockReturnValue(null);
    expect(loadNativeAuthCipher()).toBeNull();
    expect(optional).toHaveBeenCalledWith('ExpoCryptoAES');
  });

  it('wirft nie, auch wenn die Modulabfrage selbst scheitert', () => {
    optional.mockImplementation(() => { throw new Error('jsi'); });
    expect(loadNativeSecretStore()).toBeNull();
    expect(loadNativeAuthCipher()).toBeNull();
  });
});
