import sjcl from 'sjcl';

export function pad20(str) {
  const spaces = '____________________';
  return (str + spaces).slice(0, 20);
}

export function deriveTrackerRoomId(bip39String) {
  const normalized = bip39String.trim().toLowerCase();
  const bitArray = sjcl.hash.sha256.hash(normalized);
  const fullHex = sjcl.codec.hex.fromBits(bitArray);

  return pad20(fullHex);
}

export function encryptText(key, text) {
  return sjcl.encrypt(key, text);
}

export function decryptText(key, encryptedJson) {
  return sjcl.decrypt(key, encryptedJson);
}