/**
 * Supplies the master Key-Encryption-Key (KEK). KMS-ready seam (design §11): the
 * env implementation reads a base64 key today; an AWS KMS / Vault implementation
 * can replace it later with no schema change.
 */
export interface KeyProvider {
  getKek(): Promise<Buffer>;
}

export class EnvKeyProvider implements KeyProvider {
  constructor(private readonly kekBase64: string) {}

  async getKek(): Promise<Buffer> {
    const kek = Buffer.from(this.kekBase64, 'base64');
    if (kek.length !== 32) {
      throw new Error('KEK must be base64 encoding exactly 32 bytes');
    }
    return kek;
  }
}
