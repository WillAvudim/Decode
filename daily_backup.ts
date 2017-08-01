'use strict'

/* 
  Configure 'gdrive-avudim' account.
  $ ./rclone config

  Add the following lines to /etc/crontab; USE TABS!
# Scheduled manually
15  *  *  *  *   dima    cd /home/dima/p/backup_v2_ts && /home/dima/p/backup_v2_ts/collect-commit-push | logger
45  *  *  *  *   dima    cd /home/dima/p/backup_v2_ts && /home/dima/p/backup_v2_ts/run-backup | logger
*/

import * as fs from 'fs'  // https://nodejs.org/api/fs.html
import * as path from 'path'  // https://nodejs.org/api/path.html
import * as process from 'process'

import * as g from './interface'
import * as origin_packing from './origin_packing'
import * as distribution from './distribution'
import * as encryption from './encryption'

// --------------------------------------------------------------------------------------
// Ensure that config is correct.
console.log(`Backing up: "${g.PATH_TO_ORIGIN}"`)
console.assert(
  fs.statSync(g.PATH_TO_ORIGIN).isDirectory(),
  `"${g.PATH_TO_ORIGIN}" should be the path to the directory being backed up.`)
console.assert(
  Number(g.RunProcess(`du -s ${g.PATH_TO_ORIGIN}`).match(`\\d+`)) > g.MIN_ORIGIN_SIZE_IN_BYTES,
  `Origin directory ${g.PATH_TO_ORIGIN} must exceed ${g.MIN_ORIGIN_SIZE_IN_BYTES} bytes.`
)
console.assert(
  fs.statSync(g.PATH_TO_DROPBOX).isDirectory(),
  `"${g.PATH_TO_DROPBOX}" should be the path to the DropBox directory.`)


// --------------------------------------------------------------------------------------
// Entry
async function main(): Promise<any> {
  const packing_storage: origin_packing.IntermediatePackingStorage = new origin_packing.IntermediatePackingStorage(g.PATH_TO_ORIGIN, g.INTERMEDIATE_SECURE_STORAGE)
  console.log("Packing...")
  const file_set: g.FileSet = packing_storage.DoSnapshot()

  console.log("Encrypting...")
  const encrypted_set: g.FileSet = await encryption.Encrypt(g.ENCRYPTION_KEY, file_set, g.INTERMEDIATE_SECURE_STORAGE)
  console.log(encrypted_set)

  console.log("Syncing to DropBox...")
  SyncToDropBox(encrypted_set)
  console.log("Syncing to GCloud...")

  SyncToGCloud(encrypted_set)
  console.log("Done.")
  process.exit(0)
}

main()


// --------------------------------------------------------------------------------------
// DropBox
function SyncToDropBox(input: g.FileSet): void {
  const current_sequence: string[] = distribution.ScanForLatestBackupChain(path.dirname(input.files[0]))
  distribution.ReproduceExactlyOffFileList(current_sequence, g.PATH_TO_DROPBOX)
}


// --------------------------------------------------------------------------------------
// Google Cloud
function SyncToGCloud(input: g.FileSet): void {
  g.RunProcess(`./rclone sync ${path.dirname(input.files[0])} gdrive-avudim:${g.GCLOUD_DESTINATION}`);
}
