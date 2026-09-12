/**
 * study-app — GitHub同期リレー(Google Apps Script Web App)
 *
 * 経緯(2026-09-12、ユーザー指示):
 * study-appはGitHub Pages上の静的サイトでサーバーを持たないため、ブラウザから直接
 * GitHubリポジトリへ書き込むには書き込み権限を持つ認証情報(PAT)が必要になる。
 * ブラウザ(=誰でも開発者ツールで見られる環境)にそのPATを直接持たせるのは避け、
 * このGASをサーバー側の中継役として、PATはここ(スクリプト プロパティ)にのみ置く。
 *
 * 旧GAS連携(スプレッドシートへの書き込み、commit e9ab15cで撤去)とは別物で、
 * 今回は「GitHubリポジトリのdata/配下JSON(history.json / lessons.jsonのcomments)
 * への書き込み専用」のリレーとして新規に立てる。
 *
 * study-app側(index.html)からは data/history.json・data/lessons.json を
 * 直接fetchして「読む」(GitHub Pagesが静的配信しているので認証不要)。
 * このGASは「書く」(GitHubへのPUT)専用で、読み取り用のエンドポイントは持たない。
 *
 * ---- デプロイ手順 ----
 * 1. https://script.google.com で新規プロジェクトを作成し、このファイルの内容を貼る。
 * 2. 「プロジェクトの設定」→「スクリプト プロパティ」に以下を追加する:
 *      GITHUB_TOKEN = (GitHubで発行したfine-grained PAT。
 *                       study-appリポジトリのみ、Contents: Read and write権限)
 *      REPO_OWNER   = gurii-gabreh
 *      REPO_NAME    = study-app
 * 3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」を選択し、
 *    実行ユーザー「自分」、アクセスできるユーザー「全員」で公開する。
 * 4. 発行されたウェブアプリのURLを、index.html内のGAS_URL定数に設定する
 *    (Claudeに伝えれば反映できます)。
 */

const GITHUB_API = 'https://api.github.com';

function getConfig_() {
  const p = PropertiesService.getScriptProperties();
  return {
    token: p.getProperty('GITHUB_TOKEN'),
    owner: p.getProperty('REPO_OWNER'),
    repo: p.getProperty('REPO_NAME'),
  };
}

function ghGet_(path) {
  const cfg = getConfig_();
  const url = `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`GET ${path} failed: ${res.getResponseCode()} ${res.getContentText()}`);
  }
  const json = JSON.parse(res.getContentText());
  const content = Utilities.newBlob(
    Utilities.base64Decode(json.content.replace(/\n/g, ''))
  ).getDataAsString('utf-8');
  return { sha: json.sha, data: JSON.parse(content) };
}

function ghPut_(path, dataObj, sha, message) {
  const cfg = getConfig_();
  const url = `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
  const body = {
    message: message,
    content: Utilities.base64Encode(JSON.stringify(dataObj, null, 2) + '\n', Utilities.Charset.UTF_8),
    sha: sha,
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200 && res.getResponseCode() !== 201) {
    throw new Error(`PUT ${path} failed: ${res.getResponseCode()} ${res.getContentText()}`);
  }
  return JSON.parse(res.getContentText());
}

// GitHub側のshaが他の更新で既に進んでいた場合(409)は再取得してリトライする。
// 個人利用の単一リポジトリ想定のため、複雑な衝突解決はせず単純リトライのみ。
function withRetry_(fn, times) {
  let lastErr;
  for (let i = 0; i < (times || 3); i++) {
    try {
      return fn();
    } catch (e) {
      lastErr = e;
      if (!String(e).includes('409')) throw e;
      Utilities.sleep(300 * (i + 1));
    }
  }
  throw lastErr;
}

function saveHistory_(record) {
  return withRetry_(() => {
    const { sha, data } = ghGet_('data/history.json');
    const history = data.history || [];
    // 同じidの再送(通信リトライ等)ではダブらないよう上書きにする
    const idx = history.findIndex((r) => r.id === record.id);
    if (idx >= 0) history[idx] = record;
    else history.unshift(record);
    ghPut_('data/history.json', { history }, sha, `history: ${record.course} ${record.lesson} (${record.date})`);
  });
}

function saveMemo_(key, text) {
  return withRetry_(() => {
    const { sha, data } = ghGet_('data/lessons.json');
    data.comments = data.comments || {};
    data.comments[key] = text;
    ghPut_('data/lessons.json', data, sha, `memo: ${key}`);
  });
}

function doPost(e) {
  let result = { status: 'error', message: 'unknown action' };
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'saveHistory') {
      saveHistory_(body.record);
      result = { status: 'ok' };
    } else if (body.action === 'saveMemo') {
      saveMemo_(body.key, body.text);
      result = { status: 'ok' };
    }
  } catch (err) {
    result = { status: 'error', message: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
