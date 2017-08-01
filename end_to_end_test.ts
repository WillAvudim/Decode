// import * as child_process from 'child_process' = require('child_process')
// import * as path from 'path'  // https://nodejs.org/api/path.html
// import * as cryptolib from 'crypto'  // https://nodejs.org/api/crypto.html
// import * as _ from 'underscore'  // http://underscorejs.org/#collections

import * as assert from 'assert'  // https://nodejs.org/api/assert.html
import * as fs from 'fs'  // https://nodejs.org/api/fs.html
import * as fse from 'fs-extra'  // https://www.npmjs.com/package/fs-extra
import * as os from 'os'  // https://nodejs.org/api/os.html
import * as path from 'path'  // https://nodejs.org/api/path.html
import * as process from 'process'  // https://nodejs.org/api/process.html
import * as encryption from './encryption'

import * as g from './interface'
import * as origin_packing from './origin_packing'
import * as distribution from './distribution'


const TEST_DIR: string = path.join(os.tmpdir(), `backup_testing_${g.GenerateRandomAlphanumericalId(16)}`)
console.info(`Test dir: ${TEST_DIR}`)


type TestHandler = () => Promise<any>
const registered_tests: TestHandler[] = []
function Test(fn: () => Promise<any>) {
  registered_tests.push(fn)
}


// --------------------------------------------------------------------------------------------
// End-to-end packing, encryption, unencryption, unpacking of full and multiple incrementals.
Test(async function (): Promise<any> {
  // Create full and two incrementals.

  // Full snapshot.
  const path_to_origin: string = path.join(TEST_DIR, `origin`)
  ReproduceDirectoryStructure(path_to_origin, {
    "directory1": {
      "changed_and_different_size.txt": "This file changes both its content and size.",
      "changed_and_same_size.txt": "This file changes its content, but its size remains the same. 0123456789",
      "to_be_deleted.txt": "This file is to be deleted.",
      "stays_intact.txt": "The content of this file is immutable and time keeps it so.",
      "big_file.txt": "big_file".repeat(100)
    },
    "directory2": {
      "file1.txt": "ui43h89fvyh349q87hgvui9wergbvuibrvirvrev".repeat(100),
      "file2.txt": "98473yf89734ghfiuwgbvugwvc78owegviuyrebviwerv".repeat(100)
    },
    "directory3": {
      "file1.txt": "jknwuiehiuhvwerb".repeat(100)
    },
    "file.txt": "asdfqwercbvzxcbwvwefv".repeat(100)
  })
  const intermediate_secure_storage: string = path.join(TEST_DIR, `intermediate`)
  const packing_storage: origin_packing.IntermediatePackingStorage = new origin_packing.IntermediatePackingStorage(path_to_origin, intermediate_secure_storage)
  packing_storage.OverrideDatedPrefixForTesting('20150228')
  const snapshot1: g.FileSet = packing_storage.DoSnapshot()
  assert.equal(snapshot1.type, g.FileSetType.FULL)
  assert.equal(snapshot1.files.length, 1)
  assert.equal(path.extname(snapshot1.files[0]), ".FULL")

  // 1st incremental snapshot.
  fse.removeSync(path_to_origin)
  ReproduceDirectoryStructure(path_to_origin, {
    "directory1": {
      "changed_and_different_size.txt": "This file has been changed.",
      "changed_and_same_size.txt": "This file changes its content, but its size remains the same. 9876543210",
      "added.txt": "Added.",
      "stays_intact.txt": "The content of this file is immutable and time keeps it so.",
      "big_file.txt": "big_file".repeat(100)
    },
    "directory2": {
      "file2.txt": "98473yf89734ghfiuwgbvugwvc78owegviuyrebviwerv".repeat(100)
    },
    "directory3": {
      "file1.txt": "jknwuiehiuhvwerb".repeat(100)
    },
    "file.txt": "asdfqwercbvzxcbwvwefv".repeat(100)
  })
  packing_storage.OverrideDatedPrefixForTesting('20150301')
  const snapshot2: g.FileSet = packing_storage.DoSnapshot()
  assert.equal(snapshot2.type, g.FileSetType.INCREMENTAL)
  assert.equal(snapshot2.files.length, 2)
  assert.equal(path.extname(snapshot2.files[0]), ".DELETED")
  assert.equal(path.extname(snapshot2.files[1]), ".INCREMENTAL")

  // 2nd incremental snapshot.
  fse.removeSync(path_to_origin)
  ReproduceDirectoryStructure(path_to_origin, {
    "directory1": {
      "changed_and_different_size.txt": "This file has been changed.",
      "changed_and_same_size.txt": "This file changes its content, but its size remains the same. 9876543210",
      "added.txt": "Added.",
      "stays_intact.txt": "The content of this file is immutable and time keeps it so.",
      "big_file.txt": "big_file".repeat(100)
    },
    "directory2": {
      "file2.txt": "98473yf89734ghfiuwgbvugwvc78owegviuyrebviwerv".repeat(100)
    },
    "directory3": {
      "file1.txt": "jknwuiehiuhvwerb".repeat(100),
      "added2.txt": "Added.",
    },
    "file.txt": "asdfqwercbvzxcbwvwefv".repeat(100)
  })
  packing_storage.OverrideDatedPrefixForTesting('20150304')
  const snapshot3: g.FileSet = packing_storage.DoSnapshot()
  assert.equal(snapshot3.type, g.FileSetType.INCREMENTAL)
  assert.equal(snapshot3.files.length, 1)
  assert.equal(path.extname(snapshot3.files[0]), ".INCREMENTAL")

  // Encrypt all snapshots.
  const key: string = "A secret key used during unit-testing. 01234567890123456789 AAAB"
  const path_to_encrypted: string = path.join(TEST_DIR, `path_to_encrypted`)
  const encrypted_snapshot1: g.FileSet = await encryption.Encrypt(key, snapshot1, path_to_encrypted)
  assert.equal(encrypted_snapshot1.type, g.FileSetType.FULL)
  assert.equal(encrypted_snapshot1.files.length, 1)
  assert.equal(path.basename(encrypted_snapshot1.files[0]), `20150228.FULL`)

  const encrypted_snapshot2: g.FileSet = await encryption.Encrypt(key, snapshot2, path_to_encrypted)
  assert.equal(encrypted_snapshot2.type, g.FileSetType.INCREMENTAL)
  assert.equal(encrypted_snapshot2.files.length, 2)
  assert.equal(path.basename(encrypted_snapshot2.files[0]), `20150301.DELETED`)
  assert.equal(path.basename(encrypted_snapshot2.files[1]), `20150301.INCREMENTAL`)

  const encrypted_snapshot3: g.FileSet = await encryption.Encrypt(key, snapshot3, path_to_encrypted)
  assert.equal(encrypted_snapshot3.type, g.FileSetType.INCREMENTAL)
  assert.equal(encrypted_snapshot3.files.length, 1)
  assert.equal(path.basename(encrypted_snapshot3.files[0]), `20150304.INCREMENTAL`)

  // Decrypt all snapshots.
  const encrypted_chain = distribution.ScanForLatestBackupChain(path.dirname(encrypted_snapshot3.files[0]))
  const path_to_unencrypted = path.join(TEST_DIR, 'unencrypted')
  const decrypted_files = await encryption.Decrypt(key, encrypted_chain, path_to_unencrypted)
  assert.equal(decrypted_files.length, 4)
  assert.equal(path.basename(decrypted_files[0]), `20150228.FULL`)
  assert.equal(path.basename(decrypted_files[1]), `20150301.DELETED`)
  assert.equal(path.basename(decrypted_files[2]), `20150301.INCREMENTAL`)
  assert.equal(path.basename(decrypted_files[3]), `20150304.INCREMENTAL`)

  // Unpack all snapshots
  const path_to_unpacked = path.join(TEST_DIR, 'unpacked')
  origin_packing.UnpackAll(decrypted_files, path_to_unpacked)

  // Verify all files and contents.
  const inner_dir1 = path.join(path_to_unpacked, fs.readdirSync(path_to_unpacked)[0])
  const inner_dir2 = path.join(inner_dir1, fs.readdirSync(inner_dir1)[0])
  const inner_dir3 = path.join(inner_dir2, fs.readdirSync(inner_dir2)[0])
  CheckDirectoryStructure(inner_dir3, {
    "directory1": {
      "changed_and_different_size.txt": "This file has been changed.",
      "changed_and_same_size.txt": "This file changes its content, but its size remains the same. 9876543210",
      "added.txt": "Added.",
      "stays_intact.txt": "The content of this file is immutable and time keeps it so.",
      "big_file.txt": "big_file".repeat(100)
    },
    "directory2": {
      "file2.txt": "98473yf89734ghfiuwgbvugwvc78owegviuyrebviwerv".repeat(100)
    },
    "directory3": {
      "file1.txt": "jknwuiehiuhvwerb".repeat(100),
      "added2.txt": "Added.",
    },
    "file.txt": "asdfqwercbvzxcbwvwefv".repeat(100)
  })
})


// ------------------------------------------------------------------------------------------
// Packing.

// Full and subsequent incremental snapshot.
Test(async function (): Promise<any> {
  // Do the full snapshot.
  const path_to_origin: string = path.join(TEST_DIR, `origin`)
  ReproduceDirectoryStructure(path_to_origin, {
    "directory1": {
      "changed_and_different_size.txt": "This file changes both its content and size.",
      "changed_and_same_size.txt": "This file changes its content, but its size remains the same. 0123456789",
      "to_be_deleted.txt": "This file is to be deleted.",
      "stays_intact.txt": "The content of this file is immutable and time keeps it so.",
      "big_file.txt": "big_file".repeat(100)
    },
  })
  const intermediate_secure_storage: string = path.join(TEST_DIR, `intermediate`)
  const packing_storage: origin_packing.IntermediatePackingStorage = new origin_packing.IntermediatePackingStorage(path_to_origin, intermediate_secure_storage)
  const fileset1: g.FileSet = packing_storage.DoSnapshot()
  assert.equal(fileset1.type, g.FileSetType.FULL)
  assert.equal(fileset1.files.length, 1)
  assert.equal(path.extname(fileset1.files[0]), ".FULL")

  // Do the incremental snapshot.
  fse.removeSync(path_to_origin)
  ReproduceDirectoryStructure(path_to_origin, {
    "directory1": {
      "changed_and_different_size.txt": "This file has changed.",
      "changed_and_same_size.txt": "This file changes its content, but its size remains the same. 9876543210",
      "stays_intact.txt": "The content of this file is immutable and time keeps it so."
    },
  })
  const fileset2: g.FileSet = packing_storage.DoSnapshot()
  assert.equal(fileset2.type, g.FileSetType.INCREMENTAL)
  assert.equal(fileset2.files.length, 2)
  assert.equal(path.extname(fileset2.files[0]), ".DELETED")
  assert.equal(path.extname(fileset2.files[1]), ".INCREMENTAL")
})


// --------------------------------------------------------------------------------------------
// Dropbox deployment w/ cleanup.
Test(async function (): Promise<any> {
  const backup_location: string = path.join(TEST_DIR, `packed_and_encrypted`)

  fse.emptyDirSync(backup_location)
  ReproduceDirectoryStructure(backup_location, {
    '20170702.DELETED': `List of deleted files`,
    '20170702.INCREMENTAL': `Incremental update`,
    '20170714.DELETED': `List of deleted files`,
    '20170714.INCREMENTAL': `Incremental update`,
    '20170723.DELETED': `List of deleted files`,
    '20170723.INCREMENTAL': `Incremental update`,
    '20170725.DELETED': `List of deleted files`,
    '20170725.INCREMENTAL': `Incremental update`,
  })

  assert.throws(() => distribution.ScanForLatestBackupChain(backup_location), /No full snapshot/)

  fse.emptyDirSync(backup_location)
  ReproduceDirectoryStructure(backup_location, {
    '20170701.FULL': `Full snapshot`,
    '20170702.DELETED': `List of deleted files`,
    '20170702.INCREMENTAL': `Incremental update`,
    '20170714.DELETED': `List of deleted files`,
    '20170714.INCREMENTAL': `Incremental update`,

    '20170715.FULL': `Full snapshot`,
    '20170723.DELETED': `List of deleted files`,
    '20170723.INCREMENTAL': `Incremental update`,
    '20170725.DELETED': `List of deleted files`,
    '20170725.INCREMENTAL': `Incremental update`,

    '20170730.FULL': `Full snapshot`,
    '20170731.DELETED': `List of deleted files`,
    '20170731.INCREMENTAL': `Incremental update`,
    '20170801.DELETED': `List of deleted files`,
    '20170801.INCREMENTAL': `Incremental update`,
    '20170803.DELETED': `List of deleted files`,
    '20170803.INCREMENTAL': `Incremental update`,
    '20170808.DELETED': `List of deleted files`,
    '20170808.INCREMENTAL': `Incremental update`,
  })

  const current_file_set = new g.FileSet(g.FileSetType.INCREMENTAL, [
    path.join(backup_location, `20170808.DELETED`),
    path.join(backup_location, `20170808.INCREMENTAL`)])
  assert.ok(fse.existsSync(current_file_set.files[1]))

  const copy_to_path: string = path.join(TEST_DIR, 'copy_to')
  ReproduceDirectoryStructure(copy_to_path, {
    '20170701.FULL': `Full snapshot`,  // Extraneous and will be deleted.
    '20170702.DELETED': `List of deleted files`,
    '20170702.INCREMENTAL': `Incremental update`,
    '20170714.DELETED': `List of deleted files`,
    '20170714.INCREMENTAL': `Incremental update`,

    '20170730.FULL': `Full snapshot`,
    '20170731.DELETED': `List of deleted files`,
    '20170731.INCREMENTAL': `Incremental update`,
    '20170801.DELETED': `List of deleted files`,
    '20170801.INCREMENTAL': `Incremental update`,

    // These 4 are missing at the end and will be copied.
    // '20170803.DELETED': `List of deleted files`,
    // '20170803.INCREMENTAL': `Incremental update`,
    // '20170808.DELETED': `List of deleted files`,
    // '20170808.INCREMENTAL': `Incremental update`,
  })

  const current_sequence: string[] = distribution.ScanForLatestBackupChain(backup_location)
  distribution.ReproduceExactlyOffFileList(current_sequence, copy_to_path)

  CheckDirectoryStructure(copy_to_path, {
    '20170730.FULL': `Full snapshot`,
    '20170731.DELETED': `List of deleted files`,
    '20170731.INCREMENTAL': `Incremental update`,
    '20170801.DELETED': `List of deleted files`,
    '20170801.INCREMENTAL': `Incremental update`,
    '20170803.DELETED': `List of deleted files`,
    '20170803.INCREMENTAL': `Incremental update`,
    '20170808.DELETED': `List of deleted files`,
    '20170808.INCREMENTAL': `Incremental update`,
  })
})

// --------------------------------------------------------------------------------------------
// Test Utilities.

// Given a structure like {'dir1': {'subdir1': ..., 'file_name': 'file_content'}} reproduces it
// as base_dir/...
function ReproduceDirectoryStructure(base_dir: string, content_tree: object): void {
  fse.ensureDirSync(base_dir)
  for (const [name, value] of Object.entries(content_tree)) {
    assert.equal(typeof name, `string`)
    const entry_path: string = path.join(base_dir, name)
    if (typeof value == `object`) {
      ReproduceDirectoryStructure(entry_path, value)
    } else {
      assert.equal(typeof value, `string`)
      fse.writeFileSync(entry_path, value)
    }
  }
}

/**
 * Checks that the directory has precisely (and only) identified content.
 * @param base_dir The directory in question.
 * @param content_tree The content as an associated array of directories into objects and files into file content as strings.
 */
function CheckDirectoryStructure(base_dir: string, content_tree: object): void {
  assert.ok(fs.statSync(base_dir).isDirectory(), `${base_dir} is an existing directory`)

  for (const [name, value] of Object.entries(content_tree)) {
    assert.equal(typeof name, `string`)
    const entry_path: string = path.join(base_dir, name)
    if (typeof value == `object`) {
      CheckDirectoryStructure(entry_path, value)
    } else {
      assert.equal(typeof value, `string`)
      assert.ok(fs.statSync(entry_path).isFile(), `${entry_path} is an existing file`)
      assert.equal(fse.readFileSync(entry_path), value)
    }
  }
}

// // Set to false to run live.
// //const reproduce_testing_from: string = "/home/dima/p/backup_v2_ts/test_dirs/origin"
// const reproduce_testing_from: string = "/home/dima/p/backup_v2_ts/test_dirs/changed_origin"
// const testing_sandbox_full_path: string = "/home/dima/p/backup_v2_ts/test_dirs/sandbox"
// if (reproduce_testing_from) {
//   if (fs.existsSync(testing_sandbox_full_path)) {
//     fse.removeSync(testing_sandbox_full_path)
//   }
//   fse.copySync(reproduce_testing_from, testing_sandbox_full_path)
// }

// --------------------------------------------------------------------------------------------
// Running tests.

// Guaranteed Cleanup.
process.on('beforeExit', function (exit_code: number) {
  fse.removeSync(TEST_DIR)
})

// The test loop.
async function RunAllTests() {
  for (const test of registered_tests) {
    // Before each
    fse.removeSync(TEST_DIR)
    fse.ensureDirSync(TEST_DIR)

    // Run the test.
    await test()
  }

  console.info("ALL TESTS HAVE SUCCESSFULLY FINISHED")
  process.exit(0)
}
RunAllTests()
