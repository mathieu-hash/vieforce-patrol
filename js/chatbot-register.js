// Chatbot-style registration wizard — Messenger-pattern flow engine
// Drives both new-store and new-farm registration via a flow spec.

(function () {
  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function ChatbotWizard(opts) {
    this.flow = opts.flow;                       // array of steps
    this.messagesId = opts.messagesId;           // container id for bubbles
    this.quickRepliesId = opts.quickRepliesId;   // container for quick-reply chips
    this.inputBarId = opts.inputBarId;           // input bar element
    this.inputId = opts.inputId;                 // text input id
    this.onFinish = opts.onFinish;               // (data) => Promise
    this.headerAvId = opts.headerAvId;           // avatar element id (optional)
    this.data = {};
    this.stepIndex = 0;
    this.done = false;
    this.currentStepId = null;
  }

  ChatbotWizard.prototype.start = function () {
    this.data = {};
    this.stepIndex = 0;
    this.done = false;
    this.currentStepId = null;
    document.getElementById(this.messagesId).innerHTML = '';
    this._showStep(this.flow[0]);
  };

  ChatbotWizard.prototype._findStep = function (id) {
    for (var i = 0; i < this.flow.length; i++) {
      if (this.flow[i].id === id) return { step: this.flow[i], index: i };
    }
    return null;
  };

  ChatbotWizard.prototype._showStep = function (step) {
    var self = this;
    if (!step) return;
    this.currentStepId = step.id || null;

    // Add typing dots then the message
    this._addTyping();
    setTimeout(function () {
      self._removeTyping();
      self._addBotMessage(step.msg);

      // Clear quick replies
      var qr = document.getElementById(self.quickRepliesId);
      var ib = document.getElementById(self.inputBarId);
      if (qr) qr.innerHTML = '';
      if (ib) ib.style.display = 'none';

      if (step.quickReplies) {
        self._renderQuickReplies(step);
      } else if (step.input) {
        self._renderInput(step);
      } else if (step.action) {
        // Auto-run action (e.g., capture GPS) after greeting
        self._runAction(step);
      } else if (step.summary) {
        self._renderSummary(step);
      } else if (step.next) {
        // Chain next message automatically
        setTimeout(function () { self._goNext(step.next); }, 400);
      }

      self._scrollToBottom();
    }, 500);
  };

  ChatbotWizard.prototype.refreshFlow = function (nextFlow) {
    if (!Array.isArray(nextFlow) || nextFlow.length === 0 || this.done) return;
    var stepId = this.currentStepId || (this.flow[this.stepIndex] && this.flow[this.stepIndex].id);
    this.flow = nextFlow;
    if (!stepId) return;
    var found = this._findStep(stepId);
    if (!found) return;
    this.stepIndex = found.index;
    this.currentStepId = found.step.id || stepId;
    this._refreshCurrentStepUi(found.step);
  };

  ChatbotWizard.prototype._refreshCurrentStepUi = function (step) {
    if (!step || this.done) return;
    var qr = document.getElementById(this.quickRepliesId);
    var ib = document.getElementById(this.inputBarId);
    var inp = document.getElementById(this.inputId);
    if (step.quickReplies) {
      if (ib) ib.style.display = 'none';
      this._renderQuickReplies(step);
      return;
    }
    if (step.input && ib && inp) {
      if (qr) qr.innerHTML = '';
      ib.style.display = 'flex';
      inp.type = step.input === 'tel' ? 'tel' : (step.input === 'number' ? 'number' : 'text');
      inp.placeholder = step.placeholder || '...';
    }
  };

  ChatbotWizard.prototype._addBotMessage = function (msg) {
    var msgs = document.getElementById(this.messagesId);
    var row = document.createElement('div');
    row.className = 'msg-row';
    row.innerHTML =
      '<div class="msg-av-small" style="background:linear-gradient(135deg,#4A90E2,#6BA3E8)">\ud83c\udfea</div>' +
      '<div><div class="bubble in">' + esc(msg) + '</div></div>';
    msgs.appendChild(row);
  };

  ChatbotWizard.prototype._addUserMessage = function (msg) {
    var msgs = document.getElementById(this.messagesId);
    var row = document.createElement('div');
    row.className = 'msg-row out';
    row.innerHTML =
      '<div><div class="bubble out gradient">' + esc(msg) + '</div></div>';
    msgs.appendChild(row);
    this._scrollToBottom();
  };

  ChatbotWizard.prototype._addTyping = function () {
    var msgs = document.getElementById(this.messagesId);
    var row = document.createElement('div');
    row.id = this.messagesId + '_typing';
    row.className = 'msg-row';
    row.innerHTML =
      '<div class="msg-av-small" style="background:linear-gradient(135deg,#4A90E2,#6BA3E8)">\ud83c\udfea</div>' +
      '<div class="typing"><span></span><span></span><span></span></div>';
    msgs.appendChild(row);
    this._scrollToBottom();
  };

  ChatbotWizard.prototype._removeTyping = function () {
    var t = document.getElementById(this.messagesId + '_typing');
    if (t && t.parentNode) t.parentNode.removeChild(t);
  };

  ChatbotWizard.prototype._scrollToBottom = function () {
    var msgs = document.getElementById(this.messagesId);
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  };

  ChatbotWizard.prototype._renderQuickReplies = function (step) {
    var self = this;
    var qr = document.getElementById(this.quickRepliesId);
    if (!qr) return;
    qr.innerHTML = '';
    step.quickReplies.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'quick-reply';
      btn.textContent = opt.text;
      btn.onclick = function () { self._answerQuick(step, opt); };
      qr.appendChild(btn);
    });
  };

  ChatbotWizard.prototype._answerQuick = function (step, opt) {
    this._addUserMessage(opt.text);
    if (step.field) this.data[step.field] = opt.value;

    var qr = document.getElementById(this.quickRepliesId);
    if (qr) qr.innerHTML = '';

    if (step.onAnswer) step.onAnswer.call(this, opt.value, this.data);

    if (opt.next) { this._goNext(opt.next); return; }
    if (step.next) this._goNext(step.next);
  };

  ChatbotWizard.prototype._renderInput = function (step) {
    var self = this;
    var ib = document.getElementById(this.inputBarId);
    var inp = document.getElementById(this.inputId);
    if (!ib || !inp) return;
    ib.style.display = 'flex';
    inp.value = '';
    inp.type = step.input === 'tel' ? 'tel' : (step.input === 'number' ? 'number' : 'text');
    inp.placeholder = step.placeholder || '...';
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 100);

    // Hook send
    window.__chatbotSend = function () {
      var val = (inp.value || '').trim();
      if (!val && !step.allowEmpty) return;
      self._addUserMessage(val || (step.emptyUserHint || '\u2014'));
      if (step.field) {
        if (val) self.data[step.field] = val;
        else if (step.allowEmpty) self.data[step.field] = '';
      }
      ib.style.display = 'none';
      inp.value = '';
      if (step.next) self._goNext(step.next);
    };
  };

  ChatbotWizard.prototype._runAction = function (step) {
    var self = this;
    if (step.action === 'gps') {
      if (typeof getCurrentPosition === 'function') {
        getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 }).then(function (pos) {
          if (pos) {
            self.data.lat = pos.lat;
            self.data.lng = pos.lng;
            self.data.accuracy = pos.accuracy;
            self._addUserMessage('\ud83d\udccd GPS: ' + pos.lat.toFixed(4) + ', ' + pos.lng.toFixed(4));
          } else {
            self._addUserMessage('\u26a0\ufe0f Walang GPS');
          }
          if (step.next) self._goNext(step.next);
        });
      } else if (step.next) {
        self._goNext(step.next);
      }
    } else if (step.action === 'photo') {
      if (typeof capturePhoto === 'function') {
        capturePhoto().then(function (blob) {
          if (blob) {
            self.data.photo = blob;
            self._addUserMessage('\ud83d\udcf8 Litrato ' + Math.round(blob.size / 1024) + 'KB');
          } else {
            self._addUserMessage('\u23ed\ufe0f Walang litrato');
          }
          if (step.next) self._goNext(step.next);
        });
      } else if (step.next) {
        self._goNext(step.next);
      }
    }
  };

  ChatbotWizard.prototype._renderSummary = function (step) {
    var self = this;
    var msgs = document.getElementById(this.messagesId);
    var lines = [];
    (step.fields || Object.keys(this.data)).forEach(function (key) {
      var v = self.data[key];
      if (v == null || v === '' || key === 'photo') return;
      lines.push('<b>' + esc(key) + ':</b> ' + esc(v));
    });
    var row = document.createElement('div');
    row.className = 'msg-row';
    row.innerHTML =
      '<div class="msg-av-small" style="background:linear-gradient(135deg,#4A90E2,#6BA3E8)">\ud83d\udccb</div>' +
      '<div><div class="bubble in">' + lines.join('<br>') + '</div></div>';
    msgs.appendChild(row);
    this._renderQuickReplies(step);
  };

  ChatbotWizard.prototype._goNext = function (nextId) {
    var self = this;
    if (nextId === 'done') {
      this._finish();
      return;
    }
    var found = this._findStep(nextId);
    if (!found) return;
    this.stepIndex = found.index;
    this._showStep(found.step);
  };

  ChatbotWizard.prototype._finish = function () {
    var self = this;
    this.done = true;
    var qr = document.getElementById(this.quickRepliesId);
    var ib = document.getElementById(this.inputBarId);
    if (qr) qr.innerHTML = '';
    if (ib) ib.style.display = 'none';
    this._addTyping();
    setTimeout(function () {
      self._removeTyping();
      self._addBotMessage('Sine-save... \ud83d\udcbe');
      if (self.onFinish) {
        Promise.resolve(self.onFinish(self.data)).then(function (result) {
          var msg = result && result.message
            ? result.message
            : '\u2705 Na-save na!';
          self._addBotMessage(msg);
        }).catch(function (err) {
          self._addBotMessage('\u274c May problema: ' + (err && err.message || err));
        });
      }
    }, 400);
  };

  window.ChatbotWizard = ChatbotWizard;
})();
