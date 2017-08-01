'use strict'

import * as fs from 'fs'  // https://nodejs.org/api/fs.html
import * as fse from 'fs-extra'  // https://www.npmjs.com/package/fs-extra
import * as path from 'path'  // https://nodejs.org/api/path.html
import * as cryptolib  from 'crypto'  // https://nodejs.org/api/crypto.html

import * as g from './interface'


export async function Encrypt(key: string, input: g.FileSet, intermediate_secure_storage: string): Promise<g.FileSet> {
  const path_to_output_secured: string = path.join(intermediate_secure_storage, "output_secured")
  fse.ensureDirSync(path_to_output_secured)

  const result_file_set = new g.FileSet(input.type, [])

  for (const input_path of input.files) {
    const encrypted_file = await EncryptSingleFile(key, input_path, path_to_output_secured)
    result_file_set.files.push(encrypted_file)
  }

  return result_file_set
}

export async function Decrypt(key: string, file_list: string[], destination: string): Promise<string[]> {
  fse.ensureDirSync(destination)
  const decrypted_files: string[] = []

  for (const input_path of file_list) {
    const decrypted_file = await DecryptSingleFile(key, input_path, path.join(destination, path.basename(input_path)))
    decrypted_files.push(decrypted_file)
  }

  return decrypted_files
}

// Encrypts the specified file. Returns the full path to the encrypted file.
function EncryptSingleFile(key: string, source_file: string, destination_dir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const dest_encrypted_file = path.join(destination_dir, path.basename(source_file))
    fse.ensureDirSync(destination_dir)

    const cipher = cryptolib.createCipher('aes-256-ctr', key)
    const input = fs.createReadStream(source_file)
    const output = fs.createWriteStream(dest_encrypted_file)

    input.pipe(cipher).pipe(output)

    output.on('finish', function() {
      console.log(`Encrypted file ${dest_encrypted_file} written to disk.`);
      resolve(dest_encrypted_file)
    });
  });
}

function DecryptSingleFile(key: string, source_file: string, destination_file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cipher = cryptolib.createDecipher('aes-256-ctr', key);
    var input = fs.createReadStream(source_file);
    var output = fs.createWriteStream(destination_file);

    input.pipe(cipher).pipe(output);

    output.on('finish', function() {
      resolve(destination_file);
    });
  });
}
