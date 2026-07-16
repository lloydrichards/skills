(function (global) {
  "use strict";

  const VALID_STATUS = new Set(["correct", "incorrect", "partial", "unassessed"]);
  let errorSequence = 0;

  function required(root, selector) {
    const element = root.querySelector(selector);
    if (!element) throw new Error(`Learning primitive requires ${selector}`);
    return element;
  }

  function defaultCapture(form) {
    const entries = Array.from(new FormData(form).entries());
    if (entries.length === 1) return entries[0][1];
    return entries.reduce((values, [name, value]) => {
      if (!(name in values)) values[name] = value;
      else if (Array.isArray(values[name])) values[name].push(value);
      else values[name] = [values[name], value];
      return values;
    }, {});
  }

  function hasMeaningfulValue(value) {
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.some(hasMeaningfulValue);
    if (value && typeof value === "object") return Object.values(value).some(hasMeaningfulValue);
    return value !== undefined && value !== null && value !== false;
  }

  function normalizeResult(result) {
    const value = result || {};
    const status = VALID_STATUS.has(value.status) ? value.status : "unassessed";
    return {
      status,
      feedback: String(value.feedback || "Response recorded for review."),
      criteria: Array.isArray(value.criteria) ? value.criteria : []
    };
  }

  function validate(value, validator) {
    if (validator) return String(validator(value) || "");
    if (!hasMeaningfulValue(value)) return "Enter a response before continuing.";
    return "";
  }

  function showError(form, message) {
    const field = form.querySelector("textarea, input, select");
    if (field) field.setAttribute("aria-invalid", "true");
    let error = form.querySelector("[data-role='error']");
    if (!error) {
      error = document.createElement("p");
      error.dataset.role = "error";
      error.className = "learning-error";
      form.append(error);
    }
    error.textContent = message;
    if (field && !error.id) error.id = `${field.id || "learning-field"}-error-${++errorSequence}`;
    if (field) {
      const descriptions = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      descriptions.add(error.id);
      field.setAttribute("aria-describedby", Array.from(descriptions).join(" "));
    }
    if (field) field.focus();
  }

  function clearError(form) {
    const field = form.querySelector("[aria-invalid='true']");
    const error = form.querySelector("[data-role='error']");
    if (field) {
      field.removeAttribute("aria-invalid");
      if (error) {
        const descriptions = (field.getAttribute("aria-describedby") || "")
          .split(/\s+/)
          .filter((id) => id && id !== error.id);
        if (descriptions.length) field.setAttribute("aria-describedby", descriptions.join(" "));
        else field.removeAttribute("aria-describedby");
      }
    }
    if (error) error.remove();
  }

  function setFormLocked(form, locked) {
    for (const control of form.elements) control.disabled = locked;
  }

  function focusHeading(container) {
    const heading = container.querySelector("h2, h3, h4, [data-role='stage-heading']");
    if (!heading) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus();
  }

  function makeEnvelope(config, primitive, now) {
    return {
      schemaVersion: "1.0",
      sessionId: config.sessionId || `local-${now().replace(/[^0-9]/g, "")}`,
      activityId: config.activityId,
      primitive,
      activityRole: config.activityRole || "guided",
      capabilityId: config.capabilityId,
      startedAt: now(),
      completedAt: null,
      artifact: config.artifact || { title: config.title || "Learning activity" },
      attempts: [],
      completion: {
        completed: false,
        proposedState: "introduced",
        rationale: "The activity has not yet recorded a committed attempt."
      }
    };
  }

  function publicEnvelope(envelope) {
    return JSON.parse(JSON.stringify(envelope));
  }

  function formatEvidenceText(envelope) {
    return JSON.stringify(publicEnvelope(envelope), null, 2);
  }

  async function copyEvidence(envelope) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      throw new Error("Clipboard access is unavailable. Select and copy the evidence summary manually.");
    }
    await navigator.clipboard.writeText(formatEvidenceText(envelope));
  }

  function showEvidenceFallback(root, envelope, feedback) {
    let wrapper = root.querySelector("[data-role='evidence-fallback']");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.dataset.role = "evidence-fallback";
      wrapper.className = "learning-evidence-fallback";
      const label = document.createElement("label");
      const textarea = document.createElement("textarea");
      textarea.id = `learning-evidence-${++errorSequence}`;
      textarea.readOnly = true;
      textarea.rows = 10;
      label.htmlFor = textarea.id;
      label.textContent = "Session evidence — select and copy manually";
      wrapper.append(label, textarea);
      feedback.insertAdjacentElement("afterend", wrapper);
    }
    const textarea = wrapper.querySelector("textarea");
    textarea.value = formatEvidenceText(envelope);
    textarea.focus();
    textarea.select();
  }

  function addAttempt(envelope, now, stage, response, result, support) {
    const attempt = envelope.attempts.filter((item) => item.stage === stage).length + 1;
    envelope.attempts.push({
      stage,
      attempt,
      response,
      submittedAt: now(),
      result: {
        status: result.status,
        criteria: result.criteria || []
      },
      support: {
        hintIds: support.hintIds || [],
        solutionViewed: Boolean(support.solutionViewed),
        learnerReported: Boolean(support.learnerReported)
      }
    });
  }

  function configureCopy(root, getEnvelope, feedback, signal) {
    const button = root.querySelector("[data-action='copy-evidence']");
    if (!button) return;
    if (!root.querySelector("[data-role='evidence-disclosure']")) {
      const disclosure = document.createElement("p");
      disclosure.dataset.role = "evidence-disclosure";
      disclosure.className = "learning-evidence-disclosure";
      disclosure.textContent = "The evidence summary includes your responses and remains local until you choose to copy it.";
      button.insertAdjacentElement("beforebegin", disclosure);
    }
    button.addEventListener("click", async () => {
      try {
        await copyEvidence(getEnvelope());
        const fallback = root.querySelector("[data-role='evidence-fallback']");
        if (fallback) fallback.remove();
        feedback.textContent = "Session evidence copied. Return it to your learning session when you are ready.";
      } catch (error) {
        feedback.textContent = `${error.message} The summary is available in the text field that follows.`;
        showEvidenceFallback(root, getEnvelope(), feedback);
      }
    }, { signal });
  }

  function initPrediction(root, config) {
    if (!root || !config || !config.activityId || !config.capabilityId) {
      throw new Error("initPrediction requires a root, activityId, and capabilityId");
    }
    if (root.dataset.learnInitialized) throw new Error("Learning activity is already initialized");
    root.dataset.learnInitialized = "prediction";

    const controller = new AbortController();
    const { signal } = controller;
    const now = config.now || (() => new Date().toISOString());
    const predictionForm = required(root, "[data-role='prediction-form']");
    const revealButton = required(root, "[data-action='reveal']");
    const outcome = required(root, "[data-role='outcome']");
    const explanationForm = required(root, "[data-role='explanation-form']");
    const feedback = required(root, "[data-role='feedback']");
    const copyButton = root.querySelector("[data-action='copy-evidence']");
    const resetButton = root.querySelector("[data-action='reset']");
    let state = "predicting";
    let envelope = makeEnvelope(config, "prediction", now);
    let prediction;

    revealButton.disabled = true;
    explanationForm.hidden = true;
    outcome.hidden = true;
    if (copyButton) copyButton.disabled = true;

    function notify() {
      if (config.onEvidence) config.onEvidence(publicEnvelope(envelope));
    }

    predictionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state !== "predicting") return;
      if (!predictionForm.reportValidity()) return;
      const capture = config.capturePrediction || defaultCapture;
      const value = capture(predictionForm);
      const error = validate(value, config.validatePrediction);
      if (error) return showError(predictionForm, error);
      clearError(predictionForm);
      prediction = value;
      setFormLocked(predictionForm, true);
      revealButton.disabled = false;
      state = "committed";
      addAttempt(envelope, now, "prediction", value, normalizeResult(), {});
      envelope.completion = {
        completed: false,
        proposedState: "practiced",
        rationale: "A prediction was committed before the outcome was revealed."
      };
      feedback.textContent = "Prediction committed. Reveal the outcome when ready.";
      revealButton.focus();
      notify();
    }, { signal });

    revealButton.addEventListener("click", () => {
      if (state !== "committed") return;
      if (config.reveal) {
        config.reveal({ prediction, root, outcome });
      } else {
        const template = root.querySelector("template[data-role='outcome-template']");
        if (template) outcome.replaceChildren(template.content.cloneNode(true));
      }
      outcome.hidden = false;
      explanationForm.hidden = false;
      revealButton.disabled = true;
      state = "revealed";
      feedback.textContent = "Outcome revealed. Explain the result or any discrepancy with your prediction.";
      focusHeading(outcome);
      notify();
    }, { signal });

    explanationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state !== "revealed") return;
      if (!explanationForm.reportValidity()) return;
      const capture = config.captureExplanation || defaultCapture;
      const value = capture(explanationForm);
      const error = validate(value, config.validateExplanation);
      if (error) return showError(explanationForm, error);
      clearError(explanationForm);
      const result = normalizeResult(config.evaluateExplanation ? config.evaluateExplanation(value) : null);
      addAttempt(envelope, now, "explanation", value, result, {
        learnerReported: !config.evaluateExplanation
      });
      setFormLocked(explanationForm, true);
      state = "explained";
      envelope.completedAt = now();
      const isTransfer = envelope.activityRole === "transfer";
      const demonstrated = isTransfer && result.status === "correct";
      envelope.completion = {
        completed: true,
        proposedState: demonstrated ? "demonstrated" : "practiced",
        rationale: demonstrated
          ? "A correct transfer prediction and explanation were recorded without hints or solution reveal."
          : "The learner committed a prediction, observed the outcome, and explained the result. Independent successful transfer was not established."
      };
      feedback.textContent = result.feedback;
      if (copyButton) copyButton.disabled = false;
      notify();
    }, { signal });

    configureCopy(root, () => envelope, feedback, signal);

    function reset() {
      predictionForm.reset();
      explanationForm.reset();
      clearError(predictionForm);
      clearError(explanationForm);
      setFormLocked(predictionForm, false);
      setFormLocked(explanationForm, false);
      revealButton.disabled = true;
      outcome.hidden = true;
      outcome.replaceChildren();
      explanationForm.hidden = true;
      if (copyButton) copyButton.disabled = true;
      const fallback = root.querySelector("[data-role='evidence-fallback']");
      if (fallback) fallback.remove();
      feedback.textContent = "Activity reset. Enter a new prediction.";
      state = "predicting";
      prediction = undefined;
      envelope = makeEnvelope(config, "prediction", now);
      notify();
    }

    if (resetButton) resetButton.addEventListener("click", reset, { signal });

    return {
      getEvidence: () => publicEnvelope(envelope),
      reset
    };
  }

  function initWorkedTransfer(root, config) {
    if (!root || !config || !config.activityId || !config.capabilityId) {
      throw new Error("initWorkedTransfer requires a root, activityId, and capabilityId");
    }
    if (root.dataset.learnInitialized) throw new Error("Learning activity is already initialized");
    root.dataset.learnInitialized = "worked-transfer";

    const controller = new AbortController();
    const { signal } = controller;
    const now = config.now || (() => new Date().toISOString());
    const practiceStage = required(root, "[data-stage='practice']");
    const transferStage = required(root, "[data-stage='transfer']");
    const practiceForm = required(practiceStage, "form");
    const transferForm = required(transferStage, "form");
    const startPractice = required(root, "[data-action='start-practice']");
    const startTransfer = required(root, "[data-action='start-transfer']");
    const hintButton = root.querySelector("[data-action='hint']");
    const hintOutput = root.querySelector("[data-role='hint']");
    const feedback = required(root, "[data-role='feedback']");
    const copyButton = root.querySelector("[data-action='copy-evidence']");
    const resetButton = root.querySelector("[data-action='reset']");
    let envelope = makeEnvelope(config, "worked-transfer", now);
    let state = "worked";
    let hintIndex = 0;
    let practiceHintIds = [];

    practiceStage.hidden = true;
    transferStage.hidden = true;
    startTransfer.disabled = true;
    if (copyButton) copyButton.disabled = true;
    if (hintButton) hintButton.disabled = !((config.practice && config.practice.hints) || []).length;

    function notify() {
      if (config.onEvidence) config.onEvidence(publicEnvelope(envelope));
    }

    startPractice.addEventListener("click", () => {
      if (state !== "worked") return;
      practiceStage.hidden = false;
      startPractice.disabled = true;
      state = "faded";
      feedback.textContent = "Faded practice opened. Complete the missing decisions before continuing.";
      focusHeading(practiceStage);
    }, { signal });

    if (hintButton) {
      hintButton.addEventListener("click", () => {
        const hints = (config.practice && config.practice.hints) || [];
        const hint = hints[hintIndex];
        if (!hint) return;
        practiceHintIds.push(hint.id || `hint-${hintIndex + 1}`);
        if (hintOutput) {
          hintOutput.hidden = false;
          hintOutput.textContent = hint.text;
        }
        hintIndex += 1;
        if (hintIndex >= hints.length) hintButton.disabled = true;
        notify();
      }, { signal });
    }

    practiceForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state !== "faded") return;
      if (!practiceForm.reportValidity()) return;
      const capture = (config.practice && config.practice.capture) || defaultCapture;
      const value = capture(practiceForm);
      const error = validate(value, config.practice && config.practice.validate);
      if (error) return showError(practiceForm, error);
      clearError(practiceForm);
      const result = normalizeResult(config.practice && config.practice.evaluate ? config.practice.evaluate(value) : null);
      addAttempt(envelope, now, "practice", value, result, { hintIds: practiceHintIds });
      feedback.textContent = result.feedback;
      envelope.completion = {
        completed: false,
        proposedState: "practiced",
        rationale: "A faded-practice attempt was completed with feedback."
      };
      startTransfer.disabled = false;
      notify();
    }, { signal });

    startTransfer.addEventListener("click", () => {
      if (state !== "faded") return;
      transferStage.hidden = false;
      startTransfer.disabled = true;
      state = "transfer";
      feedback.textContent = "Independent transfer opened. Complete the new case without revealing a solution.";
      focusHeading(transferStage);
    }, { signal });

    transferForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state !== "transfer") return;
      if (!transferForm.reportValidity()) return;
      const capture = (config.transfer && config.transfer.capture) || defaultCapture;
      const value = capture(transferForm);
      const error = validate(value, config.transfer && config.transfer.validate);
      if (error) return showError(transferForm, error);
      clearError(transferForm);
      const result = normalizeResult(config.transfer && config.transfer.evaluate ? config.transfer.evaluate(value) : null);
      addAttempt(envelope, now, "transfer", value, result, {});
      const demonstrated = result.status === "correct";
      const completedForReview = result.status === "unassessed";
      const completed = demonstrated || completedForReview;
      let rationale = "Transfer was attempted; use the feedback and try the case again.";
      if (demonstrated) {
        rationale = "A correct independent transfer was recorded without transfer hints or solution reveal.";
      } else if (completedForReview) {
        rationale = "An independent transfer response was recorded for external assessment.";
      }
      envelope.completion = {
        completed,
        proposedState: demonstrated ? "demonstrated" : "practiced",
        rationale
      };
      feedback.textContent = result.feedback;
      if (completed) {
        state = "complete";
        envelope.completedAt = now();
        setFormLocked(transferForm, true);
        if (copyButton) copyButton.disabled = false;
      }
      notify();
    }, { signal });

    configureCopy(root, () => envelope, feedback, signal);

    function reset() {
      practiceForm.reset();
      transferForm.reset();
      clearError(practiceForm);
      clearError(transferForm);
      setFormLocked(practiceForm, false);
      setFormLocked(transferForm, false);
      practiceStage.hidden = true;
      transferStage.hidden = true;
      startPractice.disabled = false;
      startTransfer.disabled = true;
      if (hintOutput) {
        hintOutput.hidden = true;
        hintOutput.textContent = "";
      }
      if (hintButton) hintButton.disabled = !((config.practice && config.practice.hints) || []).length;
      if (copyButton) copyButton.disabled = true;
      const fallback = root.querySelector("[data-role='evidence-fallback']");
      if (fallback) fallback.remove();
      feedback.textContent = "Activity reset. Review the worked example when ready.";
      hintIndex = 0;
      practiceHintIds = [];
      state = "worked";
      envelope = makeEnvelope(config, "worked-transfer", now);
      notify();
    }

    if (resetButton) resetButton.addEventListener("click", reset, { signal });

    return {
      getEvidence: () => publicEnvelope(envelope),
      reset
    };
  }

  global.LearnPrimitives = {
    initPrediction,
    initWorkedTransfer,
    formatEvidenceText,
    copyEvidence
  };
})(typeof window !== "undefined" ? window : globalThis);
