jest.mock('./cozyclient')
const cozyClient = require('./cozyclient')
//jest.mock('./utils')
//const { queryAll } = require('./utils')
const logger = require('cozy-logger')
const saveFiles = require('./saveFiles')
const asyncResolve = val => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(val)
    }, 1)
  })
}

logger.setLevel('critical')

// TODO put in fixture file
function getBillFixtures() {
  return [
    {
      amount: 20.09,
      date: '2017-12-12T23:00:00.000Z',
      vendor: 'Free Mobile',
      type: 'phone',
      fileurl:
        'https://mobile.free.fr/moncompte/index.php?page=suiviconso&action=getFacture&format=dl&l=14730097&id=7c7dfbfc8707b75fb478f68a50b42fc6&date=20171213&multi=0',
      filename: '201712_freemobile.pdf'
    },
    {
      amount: 20.03,
      date: '2018-01-12T23:00:00.000Z',
      vendor: 'Free Mobile',
      type: 'phone',
      fileurl:
        'https://mobile.free.fr/moncompte/index.php?page=suiviconso&action=getFacture&format=dl&l=14730097&id=29654a01acee829ccf09596cf856ac1d&date=20180113&multi=0',
      filename: '201801_freemobile.pdf'
    },
    {
      amount: 20.39,
      date: '2017-01-12T23:00:00.000Z',
      vendor: 'Free Mobile',
      type: 'phone',
      fileurl:
        'https://mobile.free.fr/moncompte/index.php?page=suiviconso&action=getFacture&format=dl&l=14730097&id=0ca5e5537786bc548a87a89eba2a804a&date=20170113&multi=0',
      filename: '201701_freemobile.pdf'
    },
    {
      amount: 49.32,
      date: '2018-03-03T23:00:00.000Z',
      vendor: 'Free Mobile',
      type: 'phone',
      filestream: 'mock stream',
      filename: '201701_freemobile.pdf'
    }
  ]
}

const FOLDER_PATH = '/testfolder'
const options = { folderPath: FOLDER_PATH }
let bills

beforeEach(async function() {
  const INDEX = 'index'
  bills = getBillFixtures()
  cozyClient.data.defineIndex.mockReturnValue(() => asyncResolve(INDEX))
  cozyClient.files.create.mockReset()
  cozyClient.files.updateById.mockReset()
  cozyClient.files.statByPath.mockReset()
  cozyClient.files.create.mockImplementation((rqPromise, options) => {
    return { _id: 'newFileId', attributes: { ...options } }
  })
  cozyClient.files.updateById.mockImplementation(
    (fileId, rqPromise, options) => {
      return { _id: fileId, attributes: { ...options } }
    }
  )
})

describe('saveFiles', function() {
  const makeFile = (_id, attributes) => ({ _id, attributes })
  const rightMimeFile = makeFile('existingFileId', {
    name: '201701_freemobile.pdf',
    mime: 'application/pdf'
  })
  const badMimeFile = makeFile('existingFileId', {
    name: '201701_freemobile.pdf',
    mime: 'image/png'
  })

  // Definition of the tests
  const tests = [
    {
      name: 'when file does not exist',
      existingFile: null,
      expectCreation: true,
      expectUpdate: false,
      expectedBillFileId: 'newFileId'
    },
    {
      name: 'when file exists and mime is correct',
      existingFile: rightMimeFile,
      expectCreation: false,
      expectUpdate: false,
      expectedBillFileId: 'existingFileId'
    },
    {
      name: 'when file exists and mime is not correct',
      existingFile: badMimeFile,
      expectCreation: false,
      expectUpdate: true,
      expectedBillFileId: 'existingFileId'
    }
  ]

  // Creation of the tests
  for (let test of tests) {
    const {
      name,
      expectCreation,
      expectUpdate,
      expectedBillFileId,
      existingFile
    } = test
    describe(name, () => {
      beforeEach(async () => {
        cozyClient.files.statByPath.mockImplementation(path => {
          // Must check if we are stating on the folder or on the file
          return path === FOLDER_PATH
            ? asyncResolve({ _id: 'folderId' })
            : asyncResolve(existingFile)
        })
        await saveFiles(bills, options)
      })

      // Whether a file should be created or not
      it(`should${
        expectCreation ? ' ' : ' not '
      }create a file`, async function() {
        if (expectCreation) {
          expect(cozyClient.files.create).toHaveBeenCalledTimes(bills.length)
        } else {
          expect(cozyClient.files.create).not.toHaveBeenCalled()
        }
      })

      // Whether a file should be updated or not
      if (expectUpdate) {
        it(`should${
          expectUpdate ? ' ' : ' not '
        }update a file`, async function() {
          if (expectUpdate) {
            expect(cozyClient.files.updateById).toHaveBeenCalledTimes(
              bills.length
            )
          } else {
            expect(cozyClient.files.updateById).not.toHaveBeenCalled()
          }
        })
      }

      // File should be included in doc (useful for bills to set the invoice)
      it('should store file in doc', () => {
        const bill = bills[0]
        expect(bill.fileDocument).not.toBe(undefined)
        expect(bill.fileDocument._id).toBe(expectedBillFileId)
      })

      // Bill shouldn't have sanitized attributes
      it('should have been sanitized', () => {
        expect.assertions(2 * bills.length)
        bills.map(bill => {
          expect(bill.requestOptions).toBeUndefined()
          expect(bill.filestream).toBeUndefined()
        })
      })
    })
  }

  // // Renaming Test, not working due to not sucessfully mock updateAttributesById
  // describe('when entry have shouldReplaceName', () => {
  //   beforeEach(async () => {
  //     cozyClient.files.statByPath.mockImplementation(path => {
  //       return asyncResolve({ _id: 'folderId' })
  //     })
  //     queryAll.mockImplementation( () => {
  //       // Watch out, not the same format as cozyClient.files
  //       return [ { name: '201712_freemobile.pdf', _id: 'idToRename' } ]
  //     })
  //     cozyClient.files.updateAttributesById.mockReset()
  //     cozyClient.files.updateAttributesById.mockImplementation((id, obj) => {
  //       return
  //     })
  //   })
  //   const billWithShouldReplaceName = [
  //     {
  //       amount: 20.09,
  //       date: '2017-12-12T23:00:00.000Z',
  //       vendor: 'Free Mobile',
  //       type: 'phone',
  //       fileurl: 'https://mobile.free.fr/moncompte/index.php?page=suiviconso&action=getFacture&format=dl&l=14730097&id=7c7dfbfc8707b75fb478f68a50b42fc6&date=20171213&multi=0',
  //       filename: '201712_freemobile_nicename.pdf',
  //       shouldReplaceName: '201712_freemobile.pdf'
  //     }
  //   ]

  //   it('should replace filename', async () => {
  //     await saveFiles(billWithShouldReplaceName, options)
  //     expect(cozyClient.files.create).not.toHaveBeenCalled()
  //     expect(cozyClient.files.updateAttributesById).toHaveBeenCalled()
  //   })
  // })

  const billWithoutFilename = [
    {
      amount: 62.93,
      date: '2018-03-03T23:00:00.000Z',
      vendor: 'Free Mobile',
      type: 'phone',
      filestream: 'mock stream'
    }
  ]
  describe('when filestream is used without filename', () => {
    it('should throw an error', async () => {
      expect.assertions(2)
      try {
        await saveFiles(billWithoutFilename, options)
      } catch (error) {
        expect(error).toEqual(new Error('Missing filename property'))
      }
      expect(cozyClient.files.create).not.toHaveBeenCalled()
    })
  })

  const billWithoutStreamUrlAndRequestOptions = [
    {
      amount: 62.93,
      date: '2018-03-03T23:00:00.000Z',
      vendor: 'Free Mobile',
      type: 'phone'
    }
  ]
  describe("when entry doesn't have file creation information", () => {
    it('should do nothing', async () => {
      expect.assertions(1)
      await saveFiles(billWithoutStreamUrlAndRequestOptions, options)
      expect(cozyClient.files.create).not.toHaveBeenCalled()
    })
  })

  describe('when timeout is reached', () => {
    it('should do nothing', async () => {
      expect.assertions(1)
      await saveFiles(
        [
          {
            amount: 62.93,
            fileurl: 'https://coucou.com/filetodownload.pdf',
            filename: 'bill.pdf',
            date: '2018-03-03T23:00:00.000Z',
            vendor: 'coucou'
          }
        ],
        options,
        { timeout: 1 }
      )
      expect(cozyClient.files.create).not.toHaveBeenCalled()
    })
  })
})
