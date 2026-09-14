let skipNextHomeAnimation = false;

function markStartupHomeSceneComplete() {
  skipNextHomeAnimation = true;
}

function consumeHomeSceneEntryMode() {
  if (skipNextHomeAnimation) {
    skipNextHomeAnimation = false;
    return 'settled';
  }
  return 'return';
}

function resetHomeSceneSessionForTests() {
  skipNextHomeAnimation = false;
}

module.exports = {
  markStartupHomeSceneComplete,
  consumeHomeSceneEntryMode,
  resetHomeSceneSessionForTests,
};
