import { describe, it, expect } from 'vitest';
import { loadApp, importJson, flush, clickDialogOk, clickDialogCancel, dialogText } from './helpers.js';

describe('数据加载安全性', () => {
  it('损坏的歌曲 JSON 回退为默认歌曲且不崩溃', () => {
    const { win, errors } = loadApp({ seed: (w) => w.localStorage.setItem('lyric_songs_data', '"broken') });
    expect(errors).toHaveLength(0);
    expect(win.document.querySelectorAll('.song-item').length).toBe(3);
    expect(win.document.getElementById('songCount').textContent).toContain('3 首');
  });

  it('非数组的合法 JSON 回退为默认歌曲', () => {
    const { win, errors } = loadApp({ seed: (w) => w.localStorage.setItem('lyric_songs_data', '{"a":1}') });
    expect(errors).toHaveLength(0);
    expect(win.document.querySelectorAll('.song-item').length).toBe(3);
  });

  it('保存为空数组时保持为空（不误回退默认）', () => {
    const { win, errors } = loadApp({ seed: (w) => w.localStorage.setItem('lyric_songs_data', '[]') });
    expect(errors).toHaveLength(0);
    expect(win.document.querySelectorAll('.song-item').length).toBe(0);
  });

  it('损坏的样式配置回退为默认字号', () => {
    const { win, errors } = loadApp({ seed: (w) => w.localStorage.setItem('lyric_style_config', "'oops") });
    expect(errors).toHaveLength(0);
    expect(win.document.querySelector('.col').style.fontSize).toBe('17px');
  });

  it('样式配置缺字段时用默认值补齐，越界值被限制', () => {
    const { win } = loadApp({ seed: (w) => w.localStorage.setItem('lyric_style_config', '{"gap":"abc","letterSpacing":99}') });
    const col = win.document.querySelector('.col');
    expect(col.style.letterSpacing).toBe('6px');
    expect(col.style.fontSize).toBe('17px');
  });

  it('侧边栏宽度存储异常时使用默认宽度', () => {
    const { win } = loadApp({ seed: (w) => w.localStorage.setItem('lyric_sidebar_width', 'abc') });
    expect(win.document.getElementById('sidebar').style.width).toBe('320px');
  });
});

describe('导入数据清洗', () => {
  it('清洗缺字段、错类型、重复 id 的歌曲', () => {
    const { win, errors } = loadApp();
    expect(errors).toHaveLength(0);
    const out = win.__app.sanitizeSongList([
      { id: 'a', name: '甲', left: '词', right: '' },
      { id: 'a', name: '乙', left: '词二', right: null },
      { id: 'b', name: 123, left: '词三', right: 45 },
      { id: '', name: '', left: 'x', right: '' },
      { id: 'unk', name: '', left: '', right: '' },
      'garbage'
    ]);
    expect(out).toEqual([
      { id: 'a', name: '甲', left: '词', right: '', singer: '' },
      { id: 'a_dup0', name: '乙', left: '词二', right: '', singer: '' },
      { id: 'b', name: '123', left: '词三', right: '45', singer: '' },
      { id: 'song_4', name: '未命名歌曲', left: 'x', right: '', singer: '' }
    ]);
  });

  it('导入整体流程（覆盖模式）：数据被清洗且撤销栈被清空', async () => {
    const { win, errors } = loadApp();
    win.document.querySelectorAll('.del-btn')[0].click();
    clickDialogOk(win);
    expect(win.document.getElementById('undoDeleteBtn').disabled).toBe(false);

    importJson(win, { songs: [
      { id: 'x', name: '新歌', left: '词1', right: '' },
      { id: 'x', name: '撞车', left: '词2', right: '' }
    ] });
    await flush();
    clickDialogCancel(win);

    expect(errors).toHaveLength(0);
    const songs = win.__app.getSongs();
    expect(songs).toHaveLength(2);
    expect(songs.map((s) => s.id)).toEqual(['x', 'x_dup0']);
    expect(win.document.getElementById('undoDeleteBtn').disabled).toBe(true);
  });
});

describe('数据版本与迁移', () => {
  it('旧版数组格式数据自动迁移为带版本号的存储格式', () => {
    const { win } = loadApp({
      seed: (w) => w.localStorage.setItem('lyric_songs_data', JSON.stringify([{ id: 'x', name: '旧歌', left: '词', right: '' }]))
    });
    const stored = JSON.parse(win.localStorage.getItem('lyric_songs_data'));
    expect(stored.version).toBe(2);
    expect(stored.songs.map((s) => s.id)).toEqual(['x']);
    expect(win.document.querySelectorAll('.song-item').length).toBe(1);
  });

  it('导出数据包含 schema 版本号', () => {
    const { win } = loadApp();
    expect(win.__app.buildExportData()).toEqual({ version: 2, songs: win.__app.getSongs() });
  });

  it('v2 格式数据可直接加载', () => {
    const { win } = loadApp({
      seed: (w) => w.localStorage.setItem('lyric_songs_data', JSON.stringify({ version: 2, songs: [{ id: 'y', name: '新格式', left: '词', right: '' }] }))
    });
    expect(win.__app.getSongs().map((s) => s.id)).toEqual(['y']);
  });

  it('兼容导入旧版数组格式文件', async () => {
    const { win, errors } = loadApp();
    importJson(win, [{ id: 'a', name: '旧歌', left: '词', right: '' }]);
    await flush();
    clickDialogCancel(win);
    expect(errors).toHaveLength(0);
    expect(win.__app.getSongs().map((s) => s.id)).toEqual(['a']);
  });
});

describe('导入合并与备份', () => {
  it('合并导入：保留现有歌曲，重复 id 跳过', async () => {
    const { win, errors } = loadApp();
    importJson(win, { songs: [
      { id: 'hurt', name: '重复ID', left: 'x', right: '' },
      { id: 'new', name: '新歌', left: 'y', right: '' }
    ] });
    await flush();
    clickDialogOk(win);
    expect(errors).toHaveLength(0);
    const songs = win.__app.getSongs();
    expect(songs).toHaveLength(4);
    expect(songs.some((s) => s.id === 'new')).toBe(true);
    expect(songs.filter((s) => s.name === '重复ID')).toHaveLength(0);
  });

  it('导入前自动备份，恢复备份按钮可还原', async () => {
    const { win, errors } = loadApp();
    const before = win.__app.getSongs().map((s) => s.id);
    importJson(win, { songs: [{ id: 'only', name: '唯一', left: 'x', right: '' }] });
    await flush();
    clickDialogCancel(win);

    expect(errors).toHaveLength(0);
    const backup = JSON.parse(win.localStorage.getItem('lyric_backup_songs'));
    expect(backup.map((s) => s.id)).toEqual(before);

    win.document.getElementById('restoreBackupBtn').click();
    await flush();
    expect(win.__app.getSongs().map((s) => s.id)).toEqual(before);
  });
});

describe('中文排序', () => {
  it('歌名按拼音排序而非 Unicode 码点', () => {
    const { win } = loadApp({
      seed: (w) => w.localStorage.setItem('lyric_songs_data', JSON.stringify([
        { id: 'z', name: '张杰', left: 'x', right: '' },
        { id: 'a', name: '阿桑', left: 'x', right: '' },
        { id: 'l', name: '李宗盛', left: 'x', right: '' }
      ]))
    });
    const names = [...win.document.querySelectorAll('.song-item .name')].map((el) => el.textContent);
    expect(names).toEqual(['阿桑', '李宗盛', '张杰']);
  });
});

describe('键盘快捷键与输入框冲突', () => {
  it('搜索框聚焦时按 e / → 不触发编辑或切歌', () => {
    const { win } = loadApp();
    const search = win.document.getElementById('searchInput');
    const modal = win.document.getElementById('addModal');
    const titleBefore = win.document.querySelector('.song-title span').textContent;

    search.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    expect(modal.classList.contains('show')).toBe(false);

    search.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(win.document.querySelector('.song-title span').textContent).toBe(titleBefore);
  });

  it('非输入框处按 E 仍打开编辑弹窗（正向对照）', () => {
    const { win } = loadApp();
    const modal = win.document.getElementById('addModal');
    win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    expect(modal.classList.contains('show')).toBe(true);
  });

  it('输入框内按 Ctrl+B 仍触发全局添加快捷键', () => {
    const { win } = loadApp();
    const modal = win.document.getElementById('addModal');
    const search = win.document.getElementById('searchInput');
    search.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
    expect(modal.classList.contains('show')).toBe(true);
  });
});

describe('存储配额', () => {
  it('写入失败时弹出提示框且不崩溃', () => {
    const { win, errors } = loadApp({
      seed: (w) => {
        Object.defineProperty(w, 'localStorage', {
          configurable: true,
          value: {
            length: 0,
            key: () => null,
            clear: () => {},
            removeItem: () => {},
            getItem: () => null,
            setItem: () => {
              throw new w.DOMException('quota', 'QuotaExceededError');
            }
          }
        });
      }
    });
    expect(errors).toHaveLength(0);
    expect(win.document.getElementById('dialogModal').classList.contains('show')).toBe(true);
    expect(dialogText(win)).toContain('保存失败');
  });
});

describe('歌词字数统计', () => {
  it('left 或 right 缺失（null/undefined）时归一化为空字符串且不崩溃', () => {
    const { win, errors } = loadApp();
    const out = win.__app.sanitizeSongList([
      { id: 'm1', name: '缺右栏', left: '只有左栏', right: undefined },
      { id: 'n1', name: '双缺', left: null, right: null }
    ]);
    expect(out).toEqual([
      { id: 'm1', name: '缺右栏', left: '只有左栏', right: '', singer: '' },
      { id: 'n1', name: '双缺', left: '', right: '', singer: '' }
    ]);
    expect(errors).toHaveLength(0);
  });
});

describe('性能', () => {
  it('撤销删除时歌词内容区只重建一次', async () => {
    const { win } = loadApp();
    const wrap = win.document.getElementById('songListWrap');
    let desc = null;
    let proto = wrap;
    while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML'))) {
      proto = Object.getPrototypeOf(proto);
    }
    expect(desc).toBeTruthy();

    let count = 0;
    Object.defineProperty(wrap, 'innerHTML', {
      configurable: true,
      get() { return desc.get.call(wrap); },
      set(v) { count++; desc.set.call(wrap, v); }
    });

    win.document.querySelectorAll('.del-btn')[0].click();
    clickDialogOk(win);
    await flush();
    count = 0;
    win.document.getElementById('undoDeleteBtn').click();
    await flush();
    expect(count).toBe(1);
  });

  it('1000 首歌曲加载渲染不崩溃', () => {
    const songs = Array.from({ length: 1000 }, (_, i) => ({
      id: 's' + i, name: '歌曲' + i, left: '歌词' + i, right: ''
    }));
    const { win, errors } = loadApp({
      seed: (w) => w.localStorage.setItem('lyric_songs_data', JSON.stringify(songs))
    });
    expect(errors).toHaveLength(0);
    expect(win.document.querySelectorAll('.song-item').length).toBe(1000);
    expect(win.document.getElementById('songCount').textContent).toContain('1000 首');
  });

  it('侧边栏拖拽宽度通过 rAF 节流：拖动瞬间不立即写样式，最终保留最后一次值', async () => {
    const { win } = loadApp();
    const sidebar = win.document.getElementById('sidebar');
    const handle = win.document.getElementById('resizeHandle');
    Object.defineProperty(sidebar, 'offsetWidth', { configurable: true, value: 320 });

    const fire = (el, type, clientX) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX }));

    fire(handle, 'mousedown', 100);
    fire(win.document, 'mousemove', 200);
    expect(sidebar.style.width).not.toBe('420px');

    fire(win.document, 'mousemove', 250);
    fire(win.document, 'mousemove', 500);
    await flush();
    expect(sidebar.style.width).toBe('600px');

    fire(win.document, 'mouseup', 500);
    await flush();
    expect(sidebar.style.width).toBe('600px');
  });
});

describe('交互逻辑', () => {
  it('删除需先经确认弹窗，取消则不删除', () => {
    const { win } = loadApp();
    const before = win.__app.getSongs().length;
    win.document.querySelectorAll('.del-btn')[0].click();
    clickDialogCancel(win);
    expect(win.__app.getSongs()).toHaveLength(before);
    expect(win.document.getElementById('undoDeleteBtn').disabled).toBe(true);
  });

  it('撤销栈限制深度为 10', () => {
    const songs = Array.from({ length: 12 }, (_, i) => ({
      id: 's' + i, name: '歌' + i, left: 'x', right: ''
    }));
    const { win } = loadApp({
      seed: (w) => w.localStorage.setItem('lyric_songs_data', JSON.stringify(songs))
    });
    for (let i = 0; i < 11; i++) {
      win.document.querySelectorAll('.del-btn')[0].click();
      clickDialogOk(win);
    }
    expect(win.__app.getSongs()).toHaveLength(1);
    for (let i = 0; i < 10; i++) {
      win.document.getElementById('undoDeleteBtn').click();
    }
    expect(win.__app.getSongs()).toHaveLength(11);
    expect(win.document.getElementById('undoDeleteBtn').disabled).toBe(true);
  });

  it('切换歌曲后激活项滚动到可视区', () => {
    const { win } = loadApp();
    let calls = 0;
    Object.defineProperty(win.Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: () => { calls++; }
    });
    win.__app.switchSong('quiet');
    expect(calls).toBe(1);
    win.__app.switchSong('quiet');
    expect(calls).toBe(1);
  });

  it('输入校验错误通过弹窗提示而非阻塞式 alert', () => {
    const { win } = loadApp();
    win.document.getElementById('openAddModal').click();
    win.document.getElementById('modalConfirm').click();
    expect(win.document.getElementById('dialogModal').classList.contains('show')).toBe(true);
    expect(dialogText(win)).toContain('请填写歌曲名称');
  });
});