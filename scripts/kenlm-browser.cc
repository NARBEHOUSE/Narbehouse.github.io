// Benny's Hub's small, replaceable interface to KenLM (LGPL-2.1-or-later).
// This file is supplied as source so the browser module can be relinked.
#include "lm/model.hh"
#include <memory>
#include <sstream>
#include <string>

static std::unique_ptr<lm::ngram::ProbingModel> model;
static std::string last_error;
extern "C" {
int load_model(const char *path) {
  try {
    lm::ngram::Config config;
    config.messages = nullptr;
    config.show_progress = false;
    config.arpa_complain = lm::ngram::Config::NONE;
    config.load_method = util::READ;
    model.reset(new lm::ngram::ProbingModel(path, config));
    return model->Order();
  } catch (const std::exception &e) { last_error = e.what(); return 0; }
}
const char *model_error() { return last_error.c_str(); }
float score_word(const char *context, const char *word, int beginning) {
  if (!model) return -100;
  lm::ngram::State state, next;
  if (beginning) model->BeginSentenceWrite(&state);
  else model->NullContextWrite(&state);
  std::istringstream stream(context);
  std::string token;
  while (stream >> token) {
    model->FullScore(state, model->GetVocabulary().Index(token), next);
    state = next;
  }
  const auto index = model->GetVocabulary().Index(word);
  if (!index) return -100;
  return model->FullScore(state, index, next).prob;
}
}
