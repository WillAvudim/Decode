'use strict'

import * as child_process from 'child_process'  // https://nodejs.org/api/child_process.html
import * as fse from 'fs-extra'  // https://www.npmjs.com/package/fs-extra
import * as os from 'os'  // https://nodejs.org/api/os.html
import * as path from 'path'  // https://nodejs.org/api/path.html

/**
 * ---------------------------------------------------------------------------------
 * Global Config 
 * 
 * (updated by unit tests when necessary).
 */

export const MIN_ORIGIN_SIZE_IN_BYTES: Number = 250000  // 349364 as of 2017-07
export const PATH_TO_ORIGIN: string = path.join(os.homedir(), `/me`)
export const INTERMEDIATE_SECURE_STORAGE: string = path.join(os.homedir(), `/.backup_state`)
export const DEBUGGING_OUTPUT: boolean = true
export const PATH_TO_DROPBOX: string = path.join(os.homedir(), `Dropbox/latest`)
export const GCLOUD_DESTINATION: string = `latest_v2`
export const ENCRYPTION_KEY: any = fse.readFileSync(path.join(os.homedir(), `baseline.txt`))

/**
 * ---------------------------------------------------------------------------------
 * Global Variables
 * 
 * (initialized by main())
 */

/**
 * ---------------------------------------------------------------------------------
 * Cross-modules interfaces and data structures.
 */

// Lists the produced files that need to be propagated to various storages.
export class FileSet {
  constructor(
    public type: FileSetType,
    // Full paths to all produced files.
    public files: string[]) { }
}
export enum FileSetType { FULL, INCREMENTAL }

/**
 * ---------------------------------------------------------------------------------
 * Utils: Absolute must.
 */

// Will throw an exception if the exit code isn't 0.
export function RunProcess(cmd: string): string {
  console.info(`$ ${cmd}`);
  const output = child_process.execSync(cmd).toString();
  console.info(output);
  return output;
}

// Generates random alpha-numerical (both upper and lower case used).
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
