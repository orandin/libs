const { fetchTransactionsWithManualCat } = require('./parameters')
const { getUniqueCategories, getAlphaParameter } = require('./helpers')
const bayes = require('classificator')
const { getLabelWithTags } = require('../helpers')
const logger = require('cozy-logger')

const log = logger.namespace('categorization/localModel/classifier')

const ALPHA_MIN = 2
const ALPHA_MAX = 4
const ALPHA_MAX_SMOOTHING = 12

const FAKE_TRANSACTION = {
  label: 'thisisafaketransaction',
  manualCategoryId: '0'
}

const TOKENS_TO_REWEIGHT = [
  'tag_neg',
  'tag_v_b_expense',
  'tag_neg tag_v_b_expense',
  'tag_b_expense',
  'tag_neg tag_b_expense',
  'tag_expense',
  'tag_neg tag_expense',
  'tag_noise_neg',
  'tag_neg tag_noise_neg',
  'tag_pos',
  'tag_noise_pos',
  'tag_pos tag_noise_pos',
  'tag_income',
  'tag_pos tag_income',
  'tag_b_income',
  'tag_pos tag_b_income',
  'tag_activity_income',
  'tag_pos tag_activity_income'
]

const getClassifierOptions = transactionsWithManualCat => {
  const uniqueCategories = getUniqueCategories(transactionsWithManualCat)
  const nbUniqueCategories = uniqueCategories.length
  log(
    'debug',
    'Number of unique categories in transactions with manual categories: ' +
      nbUniqueCategories
  )
  const alpha = getAlphaParameter(
    nbUniqueCategories,
    ALPHA_MIN,
    ALPHA_MAX,
    ALPHA_MAX_SMOOTHING
  )
  log('debug', 'Alpha parameter value is ' + alpha)

  let addFakeTransaction = false
  if (nbUniqueCategories === 1) {
    log(
      'info',
      'Not enough different categories, adding a fake transaction to balance the weight of the categories'
    )
    addFakeTransaction = true
  }

  return {
    initialization: { alpha, fitPrior: false },
    configuration: { addFakeTransaction }
  }
}

/**
 * Create a ready to use classifier for the local categorization model
 * @param {Array} transactionsToLearn - Transactions to learn from
 * @param {Object} intializationOptions - Options to pass to the classifier initialization
 * @param {Object} configurationOptions - Options used to configure the classifier
 */
const createLocalClassifier = (
  transactionsToLearn,
  initializationOptions,
  configurationOptions
) => {
  if (transactionsToLearn.length === 0) {
    throw new Error(
      'Impossible to instanciate a classifier since there is no manually categorized transactions to learn from'
    )
  }

  const classifier = bayes(initializationOptions)

  log('info', 'Learning from manually categorized transactions')
  for (const transaction of transactionsToLearn) {
    classifier.learn(
      getLabelWithTags(transaction),
      transaction.manualCategoryId
    )
  }

  if (configurationOptions.addFakeTransaction) {
    classifier.learn(FAKE_TRANSACTION.label, FAKE_TRANSACTION.manualCategoryId)
  }

  return classifier
}

/**
 * Reweights a word in the Naive Bayes parameter in order to mimic the
 * behavior of a sublinear TF-IDF vectorizer applied to this word.
 * The transformation applied is inspired by the scikit-learn object
 * `sklearn.feature_extraction.text.TfidfVectorizer` with `sublinear_tf`.
 * The `log(frequencyCount)` smooths the probabilities of a word across the
 * possible categories to avoid the probability of the most targeted category
 * to explode.
 * @param {*} classifier - classifier to reweight
 * @param {*} category - category in which to reweight a word
 * @param {*} word  - word to reweight
 * @param {*} frequencyCount - observed frequency count of this word in the given category
 */
const reweightWord = (classifier, category, word, frequencyCount) => {
  const newFrequencyCount = 1 + Math.log(frequencyCount)
  const deltaFrequencyCount = frequencyCount - newFrequencyCount
  // update the right entries of the classifier's parameters
  classifier.vocabulary[word] -= deltaFrequencyCount
  classifier.wordCount[category] -= deltaFrequencyCount
  classifier.wordFrequencyCount[category][word] = newFrequencyCount
}

const reweightModel = classifier => {
  // loop over categories in the wordFrequencyCat attribute
  const wordFrequencyCount = classifier.wordFrequencyCount
  // for each category
  for (const category of Object.keys(wordFrequencyCount)) {
    // extract its word-frequency count `wfc`
    const categoryWordsFrequencyCounts = wordFrequencyCount[category]
    // and search for tokens to reweight in it
    TOKENS_TO_REWEIGHT.map(wordToReweight => {
      if (categoryWordsFrequencyCounts.hasOwnProperty(wordToReweight)) {
        // for every tokens to reweight : re-compute frequency count `fc`
        const frequencyCount = categoryWordsFrequencyCounts[wordToReweight]
        if (frequencyCount !== 1) {
          reweightWord(classifier, category, wordToReweight, frequencyCount)
        }
      }
    })
  }
}

const createClassifier = async options => {
  log('info', 'Fetching manually categorized transactions')
  const transactionsWithManualCat = await fetchTransactionsWithManualCat()

  log(
    'info',
    `Fetched ${
      transactionsWithManualCat.length
    } manually categorized transactions`
  )

  log('info', 'Instanciating a new classifier')

  const classifierOptions = getClassifierOptions(transactionsWithManualCat)
  const classifier = createLocalClassifier(
    transactionsWithManualCat,
    { ...options, ...classifierOptions.initialization },
    classifierOptions.configuration
  )

  log(
    'info',
    'Reweighting model to lower the impact of amount in the prediction'
  )
  reweightModel(classifier)

  log(
    'info',
    'Reweighting model to lower the impact of amount in the prediction'
  )
  reweightModel(classifier)

  return classifier
}

module.exports = {
  createClassifier
}
