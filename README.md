# Flashcards

Local-first flashcard web app for engineering students. Single-file `index.html` with IndexedDB storage, Markdown/LaTeX rendering, and import/export.

**Quick Start**

1. Serve the app locally:
   ```bash
   python3 -m http.server 8000
   ```
2. Open `http://127.0.0.1:8000/index.html` in your browser.

**How To Use**

1. **Create Subjects and Topics**
   - Use the left sidebar to add a Subject (accent color sets the subject theme).
   - Click a Subject to drill into Topics, then add a Topic.

2. **Add Cards**
   - In a Topic, add cards as either:
     - **Q&A** (front/back)
     - **Multi-select MCQ** (prefix correct options with `*`)
   - Optionally attach an image (stored locally via IndexedDB).

3. **Study Session**
   - Start a session from the Topic view.
   - Session size is up to 15 randomized cards.
   - Grade cards via:
     - **Buttons:** Red (wrong), Yellow (partial), Green (correct)
     - **Swipes:** Right = Red, Down = Yellow, Left = Green
   - A card is mastered after **3 consecutive correct** answers.
   - Wrong answers move the card **4 positions back** in the queue.

4. **Formatting**
   - Markdown-style emphasis: `**bold**`, `*italic*`
   - Inline color: `[text]{#ff6b6b}`
   - LaTeX: wrap in `$...$` or `$$...$$` (rendered with KaTeX)

5. **Export / Import**
   - **Export JSON** for full backup of subjects, topics, cards, and progress.
   - **Export CSV** for cards only.
   - **Import JSON** to restore data into IndexedDB.

**Notes**

- All data is stored locally in your browser (IndexedDB).
- Use a local server (not file://) so IndexedDB and module scripts work reliably.
