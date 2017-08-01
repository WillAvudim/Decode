'use strict'

import * as fse from 'fs-extra'  // https://www.npmjs.com/package/fs-extra
import * as os from 'os'  // https://nodejs.org/api/os.html
import * as path from 'path'  // https://nodejs.org/api/path.html
import * as process from 'process'

// import * as g from './interface'
import * as origin_packing from './origin_packing'
import * as distribution from './distribution'
import * as encryption from './encryption'

async function Decode() {
  const unpack_from = process.argv[2]
  const unpack_to = process.argv[3]
  const key: any = process.argv[4] || fse.readFileSync(path.join(os.homedir(), `baseline.txt`))

  const encrypted_chain = distribution.ScanForLatestBackupChain(unpack_from)

  console.log(`Detected chain:`)
  console.log(encrypted_chain)

  const path_to_unencrypted = path.join(unpack_to, "unencrypted")
  const decrypted_files = await encryption.Decrypt(key, encrypted_chain, path_to_unencrypted)

  console.log(`Decrypted files:`)
  console.log(decrypted_files)

  const path_to_unpacked = path.join(unpack_to, 'unpacked')
  origin_packing.UnpackAll(decrypted_files, path_to_unpacked)

  console.log(`Done at "${path_to_unpacked}".`)

  // To compare recursively for any diffs.
  //g.RunProcess(`diff -rq /home/dima/test_unpacking/unpacked/home/dima/me ~/me`)

  process.exit(0)
}

Decode()
