/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


goog.provide('shaka.ui.TextDisplayer');

goog.require('shaka.ui.Utils');


/**
 * @implements {shaka.extern.TextDisplayer}
 * @final
 * @export
 */
shaka.ui.TextDisplayer = class {
  /**
   * Constructor.
   * @param {HTMLMediaElement} video
   * @param {!HTMLElement} videoContainer
   */
  constructor(video, videoContainer) {
    /** @private {boolean} */
    this.isTextVisible_ = false;

    /** @private {!Array.<!shaka.extern.Cue>} */
    this.cues_ = [];

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {HTMLElement} */
    this.videoContainer_ = videoContainer;

    /** @type {HTMLElement} */
    this.textContainer_ = shaka.ui.Utils.createHTMLElement('div');
    this.textContainer_.classList.add('shaka-text-container');
    this.videoContainer_.appendChild(this.textContainer_);

    /**
     * The captions' update period in seconds.
     * @private {number}
     */
    const updatePeriod = 0.25;

    /** @private {shaka.util.Timer} */
    this.captionsTimer_ =
      new shaka.util.Timer(() => this.updateCaptions_());

    this.captionsTimer_.start(updatePeriod, /* repeating= */ true);

    /** private {Map.<!shaka.extern.Cue, !HTMLElement>} */
    this.currentCuesMap_ = new Map();
  }


  /**
   * @override
   * @export
   */
  append(cues) {
    // Add the cues.
    this.cues_ = this.cues_.concat(cues);

    // Sort all the cues based on the start time and end time.
    this.cues_ = this.cues_.slice().sort((a, b) => {
      if (a.startTime != b.startTime) {
        return a.startTime - b.startTime;
      } else {
        return a.endTime - b.endTime;
      }
    });
  }


  /**
   * @override
   * @export
   */
  destroy() {
    // Remove the text container element from the UI.
    this.videoContainer_.removeChild(this.textContainer_);
    this.textContainer_ = null;

    this.isTextVisible_ = false;
    this.cues_ = [];
    if (this.captionsTimer_) {
      this.captionsTimer_.stop();
    }

    this.currentCuesMap_.clear();
  }


  /**
   * @override
   * @export
   */
  remove(start, end) {
    // Return false if destroy() has been called.
    if (!this.textContainer_) {
      return false;
    }

    // Remove the cues out of the time range from the map, and remove the
    // captions from the page.
    const cuesToRemove = new Set();
    for (const cue of this.cues_) {
      if (cue.startTime > start && cue.endTime < end) {
        cuesToRemove.add(cue);
      }
    }

    for (const cue of cuesToRemove) {
        const captionsText = this.currentCuesMap_.get(cue);
        if (captionsText) {
          this.textContainer_.removeChild(captionsText);
          this.currentCuesMap_.delete(cue);
        }
    }

    // Remove the cues out of the time range.
    this.cues_ = this.cues_.filter((cue) => !cuesToRemove.has(cue));
    return true;
  }


  /**
   * @override
   * @export
   */
  isTextVisible() {
    return this.isTextVisible_;
  }

  /**
   * @override
   * @export
   */
  setTextVisibility(on) {
    this.isTextVisible_ = on;
  }

  /**
   * Display the current captions.
   * @private
   */
  updateCaptions_() {
    // For each cue in the current cues map, if the cue's end time has passed,
    // remove the entry from the map, and remove the captions from the page.
    for (const cue of this.currentCuesMap_.keys()) {
      if (cue.startTime > this.video_.currentTime ||
          cue.endTime < this.video_.currentTime) {
        const captionsText = this.currentCuesMap_.get(cue);
        this.textContainer_.removeChild(captionsText);
        this.currentCuesMap_.delete(cue);
      }
    }

    // Get the current cues that should be displayed. If the cue is not being
    // displayed already, add it to the map, and add the captions onto the page.
    const currentCues = this.cues_.filter((cue) => {
      return cue.startTime <= this.video_.currentTime &&
             cue.endTime > this.video_.currentTime;
    });

    for (const cue of currentCues) {
      if (!this.currentCuesMap_.has(cue)) {
        const captionsText = shaka.ui.Utils.createHTMLElement('span');
        this.setCaptionStyles_(captionsText, cue);
        this.currentCuesMap_.set(cue, captionsText);
        this.textContainer_.appendChild(captionsText);
      }
    }
  }

  /**
   * @param {!HTMLElement} captionsText
   * @param {!shaka.extern.Cue} cue
   * @private
   */
  setCaptionStyles_(captionsText, cue) {
    const Cue = shaka.text.Cue;
    const captionsStyle = captionsText.style;
    const panelStyle = this.textContainer_.style;

    captionsText.textContent = cue.payload;
    captionsStyle.backgroundColor = cue.backgroundColor;
    captionsStyle.color = cue.color;
    captionsStyle.direction = cue.direction;

    // The displayAlign attribute specifys the vertical alignment of the
    // captions inside the text container. Before means at the top of the
    // text container, and after means at the bottom.
    if (cue.displayAlign == Cue.displayAlign.BEFORE) {
      panelStyle.alignItems = 'flex-start';
    } else if (cue.displayAlign == Cue.displayAlign.CENTER) {
      panelStyle.alignItems = 'flex-top';
    } else {
      panelStyle.alignItems = 'flex-end';
    }

    captionsStyle.fontFamily = cue.fontFamily;
    captionsStyle.fontWeight = cue.fontWeight.toString();
    captionsStyle.fontSize = cue.fontSize;
    captionsStyle.fontStyle = cue.fontStyle;

    // The line attribute defines the positioning of the text container inside
    // the video container.
    // - The line offsets the text container from the top, the right or left of
    //   the video viewport as defined by the writing direction.
    // - The value of the line is either as a number of lines, or a percentage
    //   of the video viewport height or width.
    // The lineAlign is an alignment for the text container's line.
    // - The Start alignment means the text container’s top side (for horizontal
    //   cues), left side (for vertical growing right), or right side (for
    //   vertical growing left) is aligned at the line.
    // - The Center alignment means the text container is centered at the line
    //   (to be implemented).
    // - The End Alignment means The text container’s bottom side (for
    //   horizontal cues), right side (for vertical growing right), or left side
    //   (for vertical growing left) is aligned at the line.
    // TODO: Implement line alignment with line number.
    // TODO: Implement lineAlignment of 'CENTER'.
    if (cue.line) {
      if (cue.lineInterpretation == Cue.lineInterpretation.PERCENTAGE) {
        if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
          if (cue.lineAlign == Cue.lineAlign.START) {
            this.textContainer_.top = cue.line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            this.textContainer_.bottom = cue.line + '%';
          }
        } else if (cue.writingMode == Cue.writingMode.VERTICAL_LEFT_TO_RIGHT) {
          if (cue.lineAlign == Cue.lineAlign.START) {
            this.textContainer_.left = cue.line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            this.textContainer_.right = cue.line + '%';
          }
        } else {
          if (cue.lineAlign == Cue.lineAlign.START) {
            this.textContainer_.right = cue.line + '%';
          } else if (cue.lineAlign == Cue.lineAlign.END) {
            this.textContainer_.left = cue.line + '%';
          }
        }
      }
    }

    captionsStyle.lineHeight = cue.lineHeight;

    // The position defines the indent of the text container in the
    // direction defined by the writing direction.
    if (cue.position) {
      if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
        this.textContainer_.paddingLeft = cue.position;
      } else {
        this.textContainer_.paddingTop = cue.position;
      }
    }

    // The positionAlign attribute is an alignment for the text container in
    // the dimension of the writing direction.
    if (cue.positionAlign == Cue.positionAlign.LEFT) {
      panelStyle.float = 'left';
    } else if (cue.positionAlign == Cue.positionAlign.RIGHT) {
      panelStyle.float = 'right';
    } else {
      panelStyle.margin = 'auto';
    }

    captionsStyle.textAlign = cue.textAlign;
    captionsStyle.textDecoration = cue.textDecoration.join(' ');
    captionsStyle.writingMode = cue.writingMode;

    // The size is a number giving the size of the text container, to be
    // interpreted as a percentage of the video, as defined by the writing
    // direction.
    if (cue.writingMode == Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM) {
      this.textContainer_.width = cue.size + '%';
    } else {
      this.textContainer_.height = cue.size + '%';
    }

    captionsStyle.textAlign = cue.textAlign;
    captionsStyle.textDecoration = cue.textDecoration.join(' ');
    captionsStyle.writingMode = cue.writingMode;
  }
};