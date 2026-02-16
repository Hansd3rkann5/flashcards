# Flashcards

Self-hosted flashcard web app for engineering students. The app serves from your laptop and uses a shared SQLite database so phone/iPad/laptop all use the same data.

**Quick Start**

1. Start the server:
   ```bash
   python3 server.py --host 0.0.0.0 --port 8000
   ```
2. Open `http://127.0.0.1:8000` on your laptop.
3. On phone/iPad, connect to the same Wi-Fi and open:
   - `http://<your-laptop-lan-ip>:8000`
4. Keep the server process running while you study.

**How To Use**

1. **Create Subjects and Topics**
   - Use the left sidebar to add a Subject (accent color sets the subject theme).
   - Click a Subject to drill into Topics, then add a Topic.

2. **Add Cards**
   - In a Topic, add cards as either:
     - **Q&A** (front/back)
     - **Multi-select MCQ** (prefix correct options with `*`)
   - Optionally attach an image (stored in SQLite).

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
   - **Import JSON** to restore data into the shared database.

**Notes**

- Data is stored in `flashcards.sqlite3` next to the app files.
- If phone/iPad cannot connect, check laptop firewall settings for inbound connections on port `8000`.
- The app now keeps a local offline cache of loaded API data and queues writes while the server is unreachable. Once the server is back, queued changes are synced automatically.
- Full app-shell offline loading via Service Worker works only in secure contexts (`https://` or `http://localhost`). On plain LAN HTTP (`http://192.168.x.x:8000`), browser Service Worker restrictions may apply.
