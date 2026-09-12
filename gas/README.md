# study-app GitHub同期リレー(GAS)

## これは何か

study-appはGitHub Pages上の静的サイトで、サーバーを持っていません。履歴(`data/history.json`)・メモ(`data/lessons.json`のcomments)をGitHubリポジトリに書き込んで端末間で共有するには、書き込み権限を持つ認証情報(GitHub PAT)が必要ですが、これをブラウザ側(誰でも開発者ツールで見られる環境)に直接持たせるのは避け、このGoogle Apps Script(GAS)をサーバー側の中継(リレー)役として使います。PATはこのGASの「スクリプト プロパティ」にのみ保存され、ブラウザには一切渡りません。

読み込み側(履歴・メモを表示する)は、GAS経由ではなく`data/history.json`・`data/lessons.json`をGitHub Pagesから直接fetchするだけです(認証不要、静的配信なので)。このGASは**書き込み専用**です。

旧GAS連携(Googleスプレッドシートへの書き込み。commit `e9ab15c`で意図的に撤去)とは別物です。今回はスプレッドシートを使わず、GitHubリポジトリのJSONファイルへ直接書き込みます。

## デプロイ手順(ユーザー側の作業)

1. https://script.google.com で新規プロジェクトを作成する。
2. エディタの中身を全部消して、このフォルダの`code.gs`の内容をそのまま貼り付ける。
3. 左側メニューの「プロジェクトの設定」(⚙️)→「スクリプト プロパティ」で、以下の3つを追加する。
   | プロパティ名 | 値 |
   |---|---|
   | `GITHUB_TOKEN` | GitHubで発行する fine-grained Personal Access Token。**study-appリポジトリのみ**に、`Contents: Read and write`権限を付与したもの |
   | `REPO_OWNER` | `gurii-gabreh` |
   | `REPO_NAME` | `study-app` |
4. 右上の「デプロイ」→「新しいデプロイ」→ 種類の選択で「ウェブアプリ」を選ぶ。
   - 実行ユーザー: 自分
   - アクセスできるユーザー: 全員
5. デプロイすると発行される**ウェブアプリのURL**をコピーし、Claudeに伝えてください。`index.html`内の`GAS_URL`定数に設定します。
6. コードを更新した場合は、「デプロイを管理」から既存デプロイを編集し、新しいバージョンを選んで再デプロイしてください(URLは変わりません)。

## 動作確認

デプロイ後、study-appで1問解いて「履歴を保存」し、数秒待ってから`data/history.json`(GitHub上)に新しいレコードが増えているか確認してください。メモも同様に、入力して1.5秒待てば`data/lessons.json`の`comments`に反映されます。反映されない場合は、GASのプロジェクトの「実行数」(左メニュー)でエラーログを確認してください。
