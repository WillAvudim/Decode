'use strict'

import * as fs from 'fs'  // https://nodejs.org/api/fs.html
import * as fse from 'fs-extra'  // https://www.npmjs.com/package/fs-extra
import * as path from 'path'  // https://nodejs.org/api/path.html

import * as _ from 'underscore'  // http://underscorejs.org/#collections

/**
 * Given a directory, answers the list of full filenames consisting of the head backup and all tailing incrementals along with accompanied files in the order of their applicability.
 * @param dir The path to the directory being scanned.
 */
export function ScanForLatestBackupChain(dir: string): string[] {
  const all_files = fs.readdirSync(dir)
  all_files.sort()

  const index_of_last_full = _.findLastIndex(all_files, file_name => path.extname(file_name) === '.FULL')
  if (index_of_last_full == -1) {
    throw `No full snapshot at ${dir}.`
  }
  return _.map(_.rest(all_files, index_of_last_full), file_name => path.join(dir, file_name))
}

/**
 * Ensures that the destination contains files and only files listed by `file_list`.
 * @param file_list The list of full filenames to be reproduced at `remote_location`.
 * @param destination The target location of this syncing operation.
 */
export function ReproduceExactlyOffFileList(file_list: string[], destination: string): void {
  // 1. Delete extraneous files (or directories).
  for (const extraneous_file of _.difference(fs.readdirSync(destination), _.map(file_list, f => path.basename(f)))) {
    fse.removeSync(path.join(destination, extraneous_file))
  }

  // 2. Copy missing files.
  const present_files: string[] = fs.readdirSync(destination)
  for (const potentially_missing_file of file_list) {
    if (!_.contains(present_files, path.basename(potentially_missing_file))) {
      fse.copySync(potentially_missing_file, path.join(destination, path.basename(potentially_missing_file)))
    }
  }
}
