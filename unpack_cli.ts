// npm install; `npm bin`/ts-node unpack_cli.ts <path-to-key> <path-to-backup> <output-path>
import * as fse from 'fs-extra'  // https://www.npmjs.com/package/fs-extra
import * as unpack from './unpack'

async function main(): Promise<void> {
  if (process.argv.length < 5) {
    console.error(`This app requires three arguments: path to the encryption key, the directory with the backup, and the output directory.`)
    process.exit(1)
  }

  const [path_to_encryption_key, dir_with_backup, output_dir] = process.argv.slice(2)
  if (!fse.existsSync(path_to_encryption_key)) {
    console.error(`Encryption key ${path_to_encryption_key} doesn't exist.`)
    process.exit(1)
  }
  if (!fse.existsSync(dir_with_backup)) {
    console.error(`Directory ${dir_with_backup} doesn't exist.`)
    process.exit(1)
  }

  await unpack.RestoreOrigin(output_dir, dir_with_backup, path_to_encryption_key)
}

main().then(() => process.exit(0))
