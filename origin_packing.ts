'use strict'

import * as assert from 'assert'  // https://nodejs.org/api/assert.html
import * as fs from 'fs'  // https://nodejs.org/api/fs.html
import * as fse from 'fs-extra'  // https://www.npmjs.com/package/fs-extra
import * as path from 'path'  // https://nodejs.org/api/path.html
import * as _ from 'underscore'  // http://underscorejs.org/#collections

import * as g from './interface'

// ----------------------------------------------------------------
// Data Structures

// List of all files (keys) associated with their states.
type CollectedFiles = { [full_file_name: string]: FileState }

interface FileState {
  size: number
  sha1: string  // The output of sha1sum in binary mode.
}

class OriginState {
  // List of discovered files along with their FileState.
  public packed_files: CollectedFiles

  // The size of the last full snapshot.
  public last_full_size: number
  // The cumulative size of all incremental snapshots since the last full one.
  public cumulative_size_of_increments: number

  constructor() {
    this.packed_files = {}
    this.last_full_size = 0
    this.cumulative_size_of_increments = 0
  }
}

// ----------------------------------------------------------------
// Public Interface
export class IntermediatePackingStorage {
  private path_to_output_tar: string
  private origin_state_serializer: JsonFileSerializer<OriginState>
  private dated_prefix: string

  constructor(
    // The origin being backed up.
    public path_to_origin: string,
    // Storage that persists from one run to the next.
    public intermediate_secure_storage: string) {

    this.path_to_output_tar = path.join(intermediate_secure_storage, "output_tar")
    fse.ensureDirSync(this.path_to_output_tar)

    this.origin_state_serializer = new JsonFileSerializer<OriginState>(
      path.join(intermediate_secure_storage, "database", "origin_state.json"),
      () => new OriginState())  // Start with an empty array if the state file doesn't exist.
  }

  DoSnapshot(): g.FileSet {
    const state: OriginState = this.origin_state_serializer.Load()
    if (!_.size(state.packed_files) || state.cumulative_size_of_increments > state.last_full_size) {
      return this.DoFullSnapshot()
    } else {
      return this.DoDeltaSnapshot()
    }
  }

  OverrideDatedPrefixForTesting(new_dated_prefix: string) {
    this.dated_prefix = new_dated_prefix
  }

  private GetOutputDatedFileName(extension: string): string {
    const today_yyyy_mm_dd = (new Date()).toISOString().substring(0, 10).replace(/-/g, '')
    const dest_file_name = path.join(this.path_to_output_tar, this.dated_prefix || today_yyyy_mm_dd)
    fse.ensureDirSync(this.path_to_output_tar)
    return dest_file_name + extension
  }

  private DoFullSnapshot(): g.FileSet {
    // Dump as-is.
    const output_full_path = this.GetOutputDatedFileName(".FULL")
    console.assert(
      !fs.existsSync(output_full_path),
      `The output file ${output_full_path} already exists!`)

    g.RunProcess(`tar zcvf ${output_full_path} ${this.path_to_origin}`)

    // Dump the state (first, so any changes in parallel will be picked up).
    const new_state = new OriginState()
    ScanDirRecursively(this.path_to_origin, new_state.packed_files)
    new_state.last_full_size = fs.statSync(output_full_path).size
    this.origin_state_serializer.Save(new_state)

    return new g.FileSet(g.FileSetType.FULL, [output_full_path])
  }

  private DoDeltaSnapshot(): g.FileSet {
    // Scan the directory for all files.
    const new_state = new OriginState()
    ScanDirRecursively(this.path_to_origin, new_state.packed_files)

    // Write down DELETED file list.
    const prev_state: OriginState = this.origin_state_serializer.Load()
    const removed_files: string[] = _.difference(_.keys(prev_state.packed_files), _.keys(new_state.packed_files))
    const returned_file_list: string[] = []
    if (removed_files.length > 0) {
      const deleted_full_path = this.GetOutputDatedFileName(".DELETED")
      fs.writeFileSync(deleted_full_path, JSON.stringify(removed_files))
      returned_file_list.push(deleted_full_path)
    }

    // Compress all new and updated files.
    const new_or_changed_files: string[] = _.keys(new_state.packed_files).filter(
      (candidate: string) =>
        !prev_state.packed_files[candidate] ||
        !_.isEqual(prev_state.packed_files[candidate], new_state.packed_files[candidate]))
    const new_or_changed_files_file_name = this.GetOutputDatedFileName(".UPDATED")
    fs.writeFileSync(new_or_changed_files_file_name, new_or_changed_files.join("\n"))
    const output_full_path = this.GetOutputDatedFileName(".INCREMENTAL")
    console.assert(
      !fs.existsSync(output_full_path),
      `The output file ${output_full_path} already exists!`)
    g.RunProcess(`tar zcvf ${output_full_path} -T "${new_or_changed_files_file_name}"`)
    fse.removeSync(new_or_changed_files_file_name)
    returned_file_list.push(output_full_path)

    // Serialize the new state.
    new_state.last_full_size = prev_state.last_full_size
    new_state.cumulative_size_of_increments = prev_state.cumulative_size_of_increments + fs.statSync(output_full_path).size
    this.origin_state_serializer.Save(new_state)

    // Return the created file set.
    return new g.FileSet(g.FileSetType.INCREMENTAL, returned_file_list)
  }
}

/**
 * Unpacks all snapshots by detecting the file purpose by its extension.
 * @param source_full_file_names The list of files that includes the head snapshot and all entailing increments.
 * @param destination The directory to unpack into.
 */
export function UnpackAll(source_full_file_names: string[], destination: string) {
  fse.ensureDirSync(destination)
  for (const source of source_full_file_names) {
    const extension: string = path.extname(source)
    if (extension == `.FULL`) {
      g.RunProcess(`tar zxvf "${source}" -C "${destination}"`)
    } else if (extension == `.INCREMENTAL`) {
      g.RunProcess(`tar zxvf "${source}" -C "${destination}"`)
    } else {
      assert.equal(extension, `.DELETED`)
      for (const deleted_file_name of JSON.parse(fse.readFileSync(source) as any)) {
        fse.removeSync(path.join(destination, deleted_file_name))
      }
    }
  }
}

// ----------------------------------------------------------------
// Private Implementation
function ScanDirRecursively(from_full_path: string, collected_files: CollectedFiles): void {
  console.log(`Scanning ${from_full_path}`)
  for (const subpath of fs.readdirSync(from_full_path)) {
    const full_path = path.join(from_full_path, subpath)
    const stats = fs.statSync(full_path)
    if (stats.isDirectory()) {
      ScanDirRecursively(full_path, collected_files)
      continue
    }

    const sha1 = g.RunProcess(`sha1sum -b "${full_path}"`).split(/\s+/)[0]
    collected_files[full_path] = {
      size: stats.size,
      sha1: sha1
    }
  }
}

// --------------------------------------------------------------------------------------
// Serializes instances of the specified type into a file.
class JsonFileSerializer<T> {
  constructor(private full_file_path: string, private get_default: () => T) {
    fse.ensureDirSync(path.dirname(full_file_path))
  }

  Load(): T {
    if (fs.existsSync(this.full_file_path)) {
      return JSON.parse(fs.readFileSync(this.full_file_path, { encoding: 'utf8' }))
    }
    return this.get_default()
  }

  Save(obj: T) {
    fs.writeFileSync(this.full_file_path, JSON.stringify(obj))
  }
}
