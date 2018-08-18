import * as child_process from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as fse from 'fs-extra'  // https://www.npmjs.com/package/fs-extra
import * as os from 'os'
import * as path from 'path'
import * as util from 'util'

const mkdtemp = util.promisify(fs.mkdtemp)
const readdir = util.promisify(fs.readdir)

export const EXT_FULL: string = 'FULL'
export const EXT_INC: string = 'INCREMENTAL'
export const EXT_DELETED: string = 'DELETED'

export const IV_SIZE_BYTES: number = 16
export const KEY_SIZE: number = 32
export const CRYPTO_ALGO: string = `AES-256-CTR`

export async function RestoreOrigin(origin_dir: string, dir_with_backup: string, path_to_encryption_key: string): Promise<void> {
  const all_files = await readdir(dir_with_backup)
  all_files.sort()

  let files_to_unpack: string[] = []
  for (let i = all_files.length - 1; i >= 0; --i) {
    if (path.extname(all_files[i]) === '.' + EXT_FULL) {
      files_to_unpack = all_files.slice(i)
      break
    }
  }

  const key: string = await fse.readFile(path_to_encryption_key, 'utf8')
  await WithTemporaryDir(async decrypted_dir => {

    for (const file of files_to_unpack) {
      await Decrypt(key, path.join(dir_with_backup, file), path.join(decrypted_dir, file))

      if (path.extname(file) === '.' + EXT_FULL || path.extname(file) === '.' + EXT_INC) {
        console.info(`Unpacking ${file}`)
        await Unpack(path.join(decrypted_dir, file), origin_dir)
      }
      if (path.extname(file) === '.' + EXT_DELETED) {
        console.info(`Deleting ${file}`)
        for (const being_deleted of JSON.parse(await fse.readFile(path.join(decrypted_dir, file), 'utf8'))) {
          await fse.remove(path.join(origin_dir, being_deleted))
        }
      }
    }

  })
}

export async function WithTemporaryDir(f: (dir: string) => Promise<void>): Promise<void> {
  const root_dir: string = path.join(os.tmpdir(), TMP_DIR_NAME)
  await fse.ensureDir(root_dir)
  const dir: string = await mkdtemp(root_dir + path.sep)
  try {
    await f(dir)
  } catch (e) {
    await fse.remove(dir)
    throw e
  }

  await fse.remove(dir)
}

export function StringKeyToBuffer(key: string): Buffer {
  const key_as_buffer: Buffer = Buffer.from(key)
  for (let i = 0; i < KEY_SIZE; ++i) {
    key_as_buffer.writeInt8(key_as_buffer.readInt8(i) ^ key_as_buffer.readInt8(key_as_buffer.length - 1 - i), i)
  }
  return key_as_buffer.slice(0, KEY_SIZE)
}

export async function Unpack(source: string, destination: string): Promise<void> {
  await fse.ensureDir(destination)
  debugger  // DO: switch to spawn
  await SpawnProcess(`tar`, [`zxvf`, `"${source}"`, `-C`, `"${destination}"`])
}

export function Decrypt(key: string, input_file: string, output_file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    var input = fs.createReadStream(input_file)

    input.on('readable', () => {
      const iv: Buffer = <any>input.read(IV_SIZE_BYTES)
      input.removeAllListeners('readable')
      const cipher = crypto.createDecipheriv(CRYPTO_ALGO, StringKeyToBuffer(key), iv)
      var output = fs.createWriteStream(output_file)
      input.unpipe()
      input.pipe(cipher).pipe(output)
      output.on('finish', function () {
        resolve()
      })
    })
  })
}

/** Will throw an exception if the exit code isn't 0. */
export function SpawnProcess(cmd: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    console.info(`$ ${cmd} ${args}`)
    const child = child_process.spawn(cmd, args, { cwd: process.cwd(), shell: true })
    let output: string = ''
    let error: string = ''

    child.stdout.on('data', function (data) {
      output = AppendAndKeepLastN(output, data, 1024)
    })
    child.stderr.on('data', function (data) {
      error = AppendAndKeepLastN(error, data, 8096)
    })
    child.on('close', function (code) {
      console.log('child process exited with code ' + code);
      if (!code) {
        resolve(output)
      } else {
        reject(error)
      }
    })
  })
}

function AppendAndKeepLastN(source: string, extra: string, limit: number): string {
  const sum: string = source + extra
  return sum.length > limit ? sum.substring(sum.length - limit) : sum
}

export let TMP_DIR_NAME: string = GenerateRandomAlphanumericalId(12)
export function OverrideTempDirNameForTests(): void {
  TMP_DIR_NAME = 'backup3'
  fse.removeSync(path.join(os.tmpdir(), TMP_DIR_NAME))
}

/** Both upper- and lowercase classes of characters are used. */
export function GenerateRandomAlphanumericalId(length: number): string {
  const char_codes: number[] = []
  for (let i = 0; i < length; ++i) {
    // for (let i = 32; i<128; ++i) { console.info(`${i} => "${String.fromCharCode(i)}"`) }
    let index = Math.floor(Math.random() * (10 + 26 + 26) + 48)
    if (index > 57) index += 7
    if (index > 90) index += 6
    char_codes.push(index)
  }

  return String.fromCharCode.apply("", char_codes)
}
