use std::io::{Read, Write};
use std::str::FromStr;

use age::secrecy::{ExposeSecret, SecretString};
use age::x25519;
use zeroize::Zeroizing;

use crate::{Error, Result};

pub fn generate_identity() -> (SecretString, String) {
    let identity = x25519::Identity::generate();
    let recipient = identity.to_public().to_string();
    (identity.to_string(), recipient)
}

pub fn recipient_for_identity(identity: &SecretString) -> Result<String> {
    let identity =
        x25519::Identity::from_str(identity.expose_secret()).map_err(|_| Error::Crypto)?;
    Ok(identity.to_public().to_string())
}

pub fn encrypt(recipient: &str, plaintext: &[u8]) -> Result<Vec<u8>> {
    let recipient = x25519::Recipient::from_str(recipient).map_err(|_| Error::InvalidData)?;
    let encryptor =
        age::Encryptor::with_recipients(std::iter::once(&recipient as &dyn age::Recipient))
            .map_err(|_| Error::Crypto)?;
    let mut ciphertext = Vec::new();
    let mut writer = encryptor
        .wrap_output(&mut ciphertext)
        .map_err(|_| Error::Crypto)?;
    writer.write_all(plaintext).map_err(|_| Error::Crypto)?;
    writer.finish().map_err(|_| Error::Crypto)?;
    Ok(ciphertext)
}

pub fn decrypt(identity: &SecretString, ciphertext: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    let identity =
        x25519::Identity::from_str(identity.expose_secret()).map_err(|_| Error::Crypto)?;
    let decryptor = age::Decryptor::new(ciphertext).map_err(|_| Error::Crypto)?;
    let identities = std::iter::once(&identity as &dyn age::Identity);
    let mut reader = decryptor.decrypt(identities).map_err(|_| Error::Crypto)?;
    let mut plaintext = Zeroizing::new(Vec::new());
    reader
        .read_to_end(&mut plaintext)
        .map_err(|_| Error::Crypto)?;
    Ok(plaintext)
}

pub fn encrypt_recovery(identity: &SecretString, passphrase: SecretString) -> Result<Vec<u8>> {
    let encryptor = age::Encryptor::with_user_passphrase(passphrase);
    let mut ciphertext = Vec::new();
    let mut writer = encryptor
        .wrap_output(&mut ciphertext)
        .map_err(|_| Error::Crypto)?;
    writer
        .write_all(identity.expose_secret().as_bytes())
        .map_err(|_| Error::Crypto)?;
    writer.finish().map_err(|_| Error::Crypto)?;
    Ok(ciphertext)
}

pub fn decrypt_recovery(ciphertext: &[u8], passphrase: SecretString) -> Result<SecretString> {
    let decryptor = age::Decryptor::new(ciphertext).map_err(|_| Error::Crypto)?;
    let identity = age::scrypt::Identity::new(passphrase);
    let mut reader = decryptor
        .decrypt(std::iter::once(&identity as &dyn age::Identity))
        .map_err(|_| Error::Crypto)?;
    let mut plaintext = Zeroizing::new(Vec::new());
    reader
        .read_to_end(&mut plaintext)
        .map_err(|_| Error::Crypto)?;
    let value = String::from_utf8(plaintext.to_vec()).map_err(|_| Error::Crypto)?;
    x25519::Identity::from_str(&value).map_err(|_| Error::Crypto)?;
    Ok(SecretString::from(value))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_wrong_key() {
        let (identity, recipient) = generate_identity();
        let encrypted = encrypt(&recipient, b"TEST_SECRET=fictitious").expect("encrypt");
        assert_eq!(
            decrypt(&identity, &encrypted).expect("decrypt").as_slice(),
            b"TEST_SECRET=fictitious"
        );
        let (wrong, _) = generate_identity();
        assert!(decrypt(&wrong, &encrypted).is_err());
    }

    #[test]
    fn corruption_is_rejected() {
        let (identity, recipient) = generate_identity();
        let mut encrypted = encrypt(&recipient, b"x").expect("encrypt");
        let index = encrypted.len() - 1;
        encrypted[index] ^= 1;
        assert!(decrypt(&identity, &encrypted).is_err());
    }

    #[test]
    fn recovery_round_trip() {
        let (identity, _) = generate_identity();
        let encrypted = encrypt_recovery(&identity, SecretString::from("correct horse".to_owned()))
            .expect("recovery encryption");
        let recovered =
            decrypt_recovery(&encrypted, SecretString::from("correct horse".to_owned()))
                .expect("recovery decryption");
        assert_eq!(identity.expose_secret(), recovered.expose_secret());
    }
}
