class LineFocusReader {
  constructor() {
    this.isActive = false;
    this.currentElement = null;
    this.currentLineIndex = -1;
    this.visualLines = [];
    this.readableElements = [];
    this.currentElementIndex = -1;
    this.statusElement = null;

    this.init();
  }

  init() {
    this.createStatusElement();
    this.bindEvents();
    this.findReadableElements();
  }

  createStatusElement() {
    this.statusElement = document.createElement("div");
    this.statusElement.className = "line-focus-status";
    this.statusElement.style.display = "none";
    this.statusElement.textContent = "Line Focus: OFF (Select text to start)";
    document.body.appendChild(this.statusElement);
  }

  bindEvents() {
    // Listen for text selection
    document.addEventListener("selectionchange", () => {
      if (!this.isActive) return;
      this.handleSelection();
    });

    // Listen for keyboard navigation
    document.addEventListener("keydown", (e) => {
      if (!this.isActive) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        this.moveToNext();
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        this.moveToPrevious();
      } else if (e.key === "Escape") {
        this.deactivate();
      }
    });

    // Toggle activation with F9
    document.addEventListener("keydown", (e) => {
      if (e.key === "F9") {
        e.preventDefault();
        this.toggle();
      }
    });

    // Recalculate lines on window resize
    window.addEventListener("resize", () => {
      if (this.isActive && this.currentElement) {
        this.calculateVisualLines(this.currentElement);
        this.highlightCurrentLine();
      }
    });
  }

  findReadableElements() {
    // Find all paragraphs and code blocks in learncpp.com content
    const contentArea =
      document.querySelector(".entry-content") || document.body;
    const elements = contentArea.querySelectorAll(
      "p, pre, h1, h2, h3, h4, h5, h6, li",
    );

    this.readableElements = Array.from(elements).filter((el) => {
      const text = el.textContent.trim();
      return text.length > 10; // Only elements with substantial text
    });
  }

  calculateVisualLines(element) {
    this.visualLines = [];
    const text = element.textContent;

    if (!text || text.length === 0) {
      return;
    }

    // For very short text (like headers), treat as single line
    if (text.length < 100) {
      this.visualLines.push({
        text: text.trim(),
        startOffset: 0,
        endOffset: text.length,
        element: element,
      });
      return;
    }

    // Use Range API to detect actual line breaks in the live element
    const range = document.createRange();
    const textNodes = this.getAllTextNodes(element);

    if (textNodes.length === 0) return;

    let lineStart = 0;
    let currentBottom = null;

    // Process text incrementally to find where lines actually break
    const words = text.split(/(\s+)/);
    let charOffset = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordEnd = charOffset + word.length;

      // Test every few words and at the end
      if (i % 2 === 0 || i === words.length - 1) {
        try {
          // Find the text node and offset for current position
          const position = this.findTextNodePosition(textNodes, wordEnd);
          if (!position) {
            charOffset = wordEnd;
            continue;
          }

          // Create range from line start to current position
          const startPos = this.findTextNodePosition(textNodes, lineStart);
          if (!startPos) {
            charOffset = wordEnd;
            continue;
          }

          range.setStart(startPos.node, startPos.offset);
          range.setEnd(position.node, position.offset);

          const rect = range.getBoundingClientRect();

          if (rect.height > 0 && rect.width > 0) {
            if (currentBottom === null) {
              currentBottom = rect.bottom;
            } else if (rect.bottom > currentBottom + 5) {
              // Line break detected - previous word was end of line
              const prevWordEnd = charOffset;
              const lineText = text.substring(lineStart, prevWordEnd).trim();

              if (lineText.length > 0) {
                this.visualLines.push({
                  text: lineText,
                  startOffset: lineStart,
                  endOffset: prevWordEnd,
                  element: element,
                });
              }

              lineStart = prevWordEnd;
              currentBottom = rect.bottom;
            }
          }
        } catch (e) {
          // Continue on range errors
          continue;
        }
      }

      charOffset = wordEnd;
    }

    // Add the last line
    const lastLineText = text.substring(lineStart).trim();
    if (lastLineText.length > 0) {
      this.visualLines.push({
        text: lastLineText,
        startOffset: lineStart,
        endOffset: text.length,
        element: element,
      });
    }

    // Fallback: if no lines detected, create one line for entire text
    if (this.visualLines.length === 0) {
      this.visualLines.push({
        text: text.trim(),
        startOffset: 0,
        endOffset: text.length,
        element: element,
      });
    }
  }

  findTextNodePosition(textNodes, targetOffset) {
    let currentOffset = 0;

    for (const node of textNodes) {
      const nodeLength = node.textContent.length;

      if (currentOffset + nodeLength >= targetOffset) {
        return {
          node: node,
          offset: Math.min(targetOffset - currentOffset, nodeLength),
        };
      }

      currentOffset += nodeLength;
    }

    // Return last position if target is beyond text
    if (textNodes.length > 0) {
      const lastNode = textNodes[textNodes.length - 1];
      return {
        node: lastNode,
        offset: lastNode.textContent.length,
      };
    }

    return null;
  }

  getAllTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim().length > 0) {
        textNodes.push(node);
      }
    }

    return textNodes;
  }

  handleSelection() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedElement = range.commonAncestorContainer;

    // Find the closest readable element
    let targetElement =
      selectedElement.nodeType === Node.TEXT_NODE
        ? selectedElement.parentElement
        : selectedElement;

    // Walk up the DOM to find a readable element
    while (targetElement && !this.readableElements.includes(targetElement)) {
      targetElement = targetElement.parentElement;
    }

    if (targetElement) {
      this.currentElementIndex = this.readableElements.indexOf(targetElement);
      this.currentElement = targetElement;
      this.calculateVisualLines(targetElement);

      // Find which line contains the selection
      const selectionOffset = this.getTextOffsetInElement(
        targetElement,
        range.startContainer,
        range.startOffset,
      );
      let lineIndex = 0;

      for (let i = 0; i < this.visualLines.length; i++) {
        if (selectionOffset <= this.visualLines[i].endOffset) {
          lineIndex = i;
          break;
        }
      }

      this.currentLineIndex = lineIndex;
      this.highlightCurrentLine();
    }
  }

  getTextOffsetInElement(element, targetNode, targetOffset) {
    let offset = 0;
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node === targetNode) {
        return offset + targetOffset;
      }
      offset += node.textContent.length;
    }

    return offset;
  }

  moveToNext() {
    if (this.currentLineIndex < this.visualLines.length - 1) {
      this.currentLineIndex++;
      this.highlightCurrentLine();
    } else {
      // Move to next element
      this.moveToNextElement();
    }
  }

  moveToPrevious() {
    if (this.currentLineIndex > 0) {
      this.currentLineIndex--;
      this.highlightCurrentLine();
    } else {
      // Move to previous element
      this.moveToPreviousElement();
    }
  }

  moveToNextElement() {
    if (this.currentElementIndex < this.readableElements.length - 1) {
      this.currentElementIndex++;
      this.currentElement = this.readableElements[this.currentElementIndex];
      this.calculateVisualLines(this.currentElement);
      this.currentLineIndex = 0;
      this.highlightCurrentLine();
    }
  }

  moveToPreviousElement() {
    if (this.currentElementIndex > 0) {
      this.currentElementIndex--;
      this.currentElement = this.readableElements[this.currentElementIndex];
      this.calculateVisualLines(this.currentElement);
      this.currentLineIndex = this.visualLines.length - 1;
      this.highlightCurrentLine();
    }
  }

  highlightCurrentLine() {
    // Remove previous highlighting
    this.clearHighlighting();

    if (
      this.currentLineIndex >= 0 &&
      this.currentLineIndex < this.visualLines.length
    ) {
      const line = this.visualLines[this.currentLineIndex];
      this.highlightTextRange(line);
    }

    this.updateStatus();
  }

  highlightTextRange(line) {
    const element = line.element;
    const textNodes = this.getAllTextNodes(element);

    if (textNodes.length === 0) {
      this.highlightEntireElement(element);
      return;
    }

    try {
      // Find which text nodes our line spans
      let currentOffset = 0;
      let startNode = null,
        startOffset = 0;
      let endNode = null,
        endOffset = 0;

      for (const textNode of textNodes) {
        const nodeLength = textNode.textContent.length;

        // Find start position
        if (
          startNode === null &&
          currentOffset + nodeLength > line.startOffset
        ) {
          startNode = textNode;
          startOffset = Math.max(0, line.startOffset - currentOffset);
        }

        // Find end position
        if (currentOffset + nodeLength >= line.endOffset) {
          endNode = textNode;
          endOffset = Math.min(nodeLength, line.endOffset - currentOffset);
          break;
        }

        currentOffset += nodeLength;
      }

      if (startNode && endNode) {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);

        // Create highlight span
        const span = document.createElement("span");
        span.className = "line-focus-highlight";

        try {
          range.surroundContents(span);

          // Scroll into view
          span.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        } catch (e) {
          // If surrounding fails, try extracting and replacing
          try {
            const contents = range.extractContents();
            span.appendChild(contents);
            range.insertNode(span);

            span.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          } catch (e2) {
            // Final fallback
            this.highlightEntireElement(element);
          }
        }
      } else {
        this.highlightEntireElement(element);
      }
    } catch (e) {
      this.highlightEntireElement(element);
    }
  }

  highlightEntireElement(element) {
    element.classList.add("line-focus-current");
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  clearHighlighting() {
    // Remove span highlights
    document.querySelectorAll(".line-focus-highlight").forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        parent.insertBefore(document.createTextNode(span.textContent), span);
        parent.removeChild(span);
        parent.normalize();
      }
    });

    // Remove element highlights
    document.querySelectorAll(".line-focus-current").forEach((el) => {
      el.classList.remove("line-focus-current");
    });
  }

  activate() {
    this.isActive = true;
    document.body.classList.add("line-focus-active");
    this.statusElement.style.display = "block";
    this.statusElement.textContent =
      "Line Focus: ON (j/k to navigate, Esc to exit)";
    this.findReadableElements(); // Refresh in case content changed
  }

  deactivate() {
    this.isActive = false;
    document.body.classList.remove("line-focus-active");
    this.clearHighlighting();
    this.statusElement.style.display = "none";
    this.currentElement = null;
    this.currentElementIndex = -1;
    this.currentLineIndex = -1;
    this.visualLines = [];
  }

  toggle() {
    console.log(
      `LineFocusReader: Toggling from ${this.isActive ? "ON" : "OFF"}`,
    );
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  updateStatus() {
    if (this.statusElement && this.currentLineIndex >= 0) {
      const totalLines = this.visualLines.length;
      const elementInfo = `${this.currentElementIndex + 1}/${this.readableElements.length}`;
      const lineInfo = `${this.currentLineIndex + 1}/${totalLines}`;
      this.statusElement.textContent = `Line Focus: ON (Element ${elementInfo}, Line ${lineInfo}) j/k to navigate, Esc to exit`;
    }
  }
}

// Initialize when the page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new LineFocusReader());
} else {
  new LineFocusReader();
}
