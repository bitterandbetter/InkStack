# InkStack Tauri Visual Baseline

- Captured at: 2026-04-28 16:19:08 +0800
- Fixture: `/Users/zhangzehua/Downloads/inkstack-(墨栈) /InkStack功能测试.md`
- Screenshot: `/Users/zhangzehua/Downloads/inkstack-(墨栈) /tmp/tauri-visual-baseline/inkstack-tauri-window.png`
- Thumbnail: `/Users/zhangzehua/Downloads/inkstack-(墨栈) /tmp/tauri-visual-baseline/inkstack-tauri-window-thumb.png`
- AI open screenshot: `/Users/zhangzehua/Downloads/inkstack-(墨栈) /tmp/tauri-visual-baseline/inkstack-tauri-window-ai-open.png`
- AI open thumbnail: `/Users/zhangzehua/Downloads/inkstack-(墨栈) /tmp/tauri-visual-baseline/inkstack-tauri-window-ai-open-thumb.png`
- Log: `/Users/zhangzehua/Downloads/inkstack-(墨栈) /tmp/tauri-visual-baseline/tauri-dev.log`

## Manual Checks

- The app opens inside a real Tauri desktop window, not a browser fallback page.
- The test Markdown document is loaded as an editable Markdown file.
- Mermaid, table, code block, missing-image warning and typography are visible after switching to split/read views.
- Light/dark theme switching does not make code blocks or secondary text unreadable.
- View shortcuts remain aligned: Cmd/Ctrl+1 edit, 2 split, 3 read, 4 code.
- AI panel can open without blocking the editor.
- Opening the AI panel does not shrink the app upward or expose a blank area below the status bar.
