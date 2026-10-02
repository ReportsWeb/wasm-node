# 03.Web API・REST連携 — Node.js / TypeScript

> このサンプルは npm パッケージ [`@pao-at-office/reports-web`](https://www.npmjs.com/package/@pao-at-office/reports-web) と、帳票エンジンの Docker イメージ [`ghcr.io/reportsweb/engine`](https://github.com/ReportsWeb/engine) を使っています。

別のアプリから「請求書をください」とHTTPで依頼し、印刷データやPDFを受け取るサンプルです。このフォルダー内の `api/` が帳票を作り、`client/` がそれを利用します。02を起動しておく必要はありません。

## 1. 用意するもの

- **Windows／macOS**：Docker Desktopをインストールして起動してください。WindowsではLinuxコンテナーを使用します。macOSでは、お使いのMac（Apple Silicon／Intel）に合うインストーラーを選びます。
- **Linux**：Docker EngineとDocker Composeプラグインを用意し、Dockerサービスを起動してください。Docker Desktopを使うこともできます。
- ターミナルで `docker version` と `docker compose version` が実行できる状態にしてください。以下のDockerコマンドは3 OS共通です。[Docker公式の導入案内](https://docs.docker.com/compose/install/)
- 初回はDockerが必要なソフトウェアを取得するため、インターネット接続が必要です。
- Node.js、TypeScriptやPostgreSQLをパソコンへ別途インストールする必要はありません。
- このリポジトリを `git clone` して、番号フォルダーでコマンドを実行します。帳票エンジンは Docker イメージ `ghcr.io/reportsweb/engine:1.0.1` として自動で取得されます。

## 2. 開発環境で開いて起動する

1. VS CodeやCursorの「ファイル → フォルダーを開く」で、**このREADMEがある `03.Web API・REST連携` フォルダー**を開きます。
2. 「ターミナル → 新しいターミナル」を開きます。
3. 次のコマンドを入力してEnterを押します。Vimなど別のエディターを使う場合も、このフォルダーへ移動したターミナルで同じコマンドを実行します。

```sh
docker compose up -d --build --wait --wait-timeout 180
```

この操作で利用側Webアプリ、Node.js / TypeScriptの帳票API、PostgreSQL、帳票エンジンが起動します。初回のビルドには数分かかることがあります。フォルダーをクリックしただけでは起動しません。

4. コマンドがエラーなく終了したら、起動状態を確認します。

```sh
docker compose ps
```

client、api、database、engineが `Up`（起動中）になっていることを確認します。

5. **ここまで成功してから**、[http://127.0.0.1:19222/](http://127.0.0.1:19222/)をブラウザーで開きます。

このURLは、お使いのパソコン内で今起動したサーバーの入口です。公開デモサイトではないため、起動前にURLだけ開いても動きません。ポートを外部へ開放する設定も不要です。

同じフォルダーの `Start.ps1`（Windows）／`sh start.sh`（macOS・Linux）でも、上と同じDockerコマンドを実行できます。

## 3. 画面で確かめる

1. 「PREPEJを受け取る」を押します。Node.js / TypeScriptのAPIが作った請求書が表示されます。
2. 通信結果の「GET」「200」とデータ形式を確認します。実際のHTTP要求と応答です。
3. 「PREPEJを保存」で、受け取った印刷データをファイルに保存します。
4. 「PDFを受け取る」で、同じ印刷データをAPIへ送り、PDFを受け取ります。
5. 「エラー応答も確認」で、存在しない帳票を要求した場合の表示を確認します。

PREPDJは帳票のデザイン、PREPEJはデータを流し込んで完成した印刷データです。PREPEJは保存して渡したり、後からプレビュー・再印刷したりできます。

「ツールバーを非表示」でプレビューだけの表示にできます。同じ場所の「ツールバーを表示」で戻せます。プレビュアー内の設定からすべて非表示にした場合も、この外側のボタンで戻せます。

## 4. ソースを一か所変えてみる

`api/src/SampleCatalog.ts`を開き、`invoice()`の中で次の行を探します。

```typescript
.setValue("txtCustomer", h["お客様名"])
```

右側を自分の文字に置き換えます。

```typescript
.setValue("txtCustomer", "サンプル商事")
```

TypeScriptはDockerイメージのビルド時にJavaScriptへコンパイルされます。ソース編集後は `docker compose up -d --build --wait --wait-timeout 180` を再実行してください。帳票定義だけの編集でも、この構成では同じコマンドで確実に反映できます。元に戻すときは、編集した行を戻して保存します。

画面で再び「PREPEJを受け取る」を押します。請求先名が変わったら、PDFでも確かめてください。

## 5. どこを読むか

|場所|役割|
|---|---|
|`api/src/SampleCatalog.ts`|帳票を作る中心部分。`invoice()`は請求書、`estimate()`は見積書、`rows()`はSQLによるデータ取得|
|`@pao-at-office/reports-web`（npm）|値、明細、ページを印刷データへまとめる`PrintData`と、エンジンへ送る`ReportsWebEngine`|
|`api/src/server.ts`|HTTP要求を受け、印刷データ・PDFを返す入口|
|`api/resources/definitions/`|帳票ごとのデザイン（PREPDJ）|
|`api/resources/images/`|角印などの画像|
|`client/index.html`|ボタン操作、APIへのHTTP要求、受け取った帳票の表示|
|`compose.yaml`|このサンプルで起動するサービスと接続先|
|`Dockerfile`（api内）|Node.js / TypeScriptの実行環境の作り方|

```text
client/index.html（利用側の画面）
       │ HTTPで要求
       ▼
api/src/server.ts
       │
api/src/SampleCatalog.ts → PostgreSQLからSQLでデータ取得
       │
       └─ PREPEJを返す → ブラウザーのプレビュー
          PDFを返す   → ダウンロード
```

初めは `client/index.html` の `request()` と、`api/src/server.ts`の `action` 分岐を読むと、送る側と受ける側がつながります。PDFは `action=server-pdf`、印刷データは `action=data`です。

デザインは`api/resources/definitions/invoice.prepdj`をReports Webデザイナーで開いて編集できます。保存先をこのファイルに戻し、第4節のDockerコマンドで再ビルドしてから帳票をもう一度読み込みます。請求書はNode.js / TypeScript側でも明細の色や幅を指定しているため、それらの変更は`invoice()`も確認してください。

## 6. 処理を追う（必要な方へ）

このサンプルにはコンテナー用のブレークポイント設定は同梱していません。`api/src/server.ts`に一時的に `console.log` を追加し、第4節のコマンドで再ビルドしてから `docker compose logs -f api` で確認できます。Ctrl+Cはログ表示だけを終了します。

## 7. 停止・削除して片付ける

### 一時停止する（あとで続きを試す）

このサンプルのフォルダーで実行します。

```sh
docker compose stop
```

コンテナーとDBデータを残して停止します（01はDBを使いません）。再開は `docker compose start` です。

### コンテナーと試用データを削除する

このサンプルのターミナルで実行します。

```sh
docker compose down --volumes
```

このサンプルのコンテナーとネットワーク、試用中のDBデータを削除します。編集したNode.js / TypeScriptや帳票定義は消えません。別の01・02・03は停止しません。次に起動すると同じ初期データが自動で入ります。DBを残して一時停止するだけなら`docker compose stop`を使います。

同梱の `Stop.ps1`／`sh stop.sh`でも同じ操作ができます。

### サンプル用イメージも削除して、最初から試す

デバッグ中なら、先にエディターのデバッグを終了してください。このサンプルのフォルダーで次を実行します。

```sh
docker compose down --rmi local --volumes --remove-orphans
```

このサンプルのコンテナー、ネットワーク、DBデータ、ビルドしたサンプル用イメージを削除します。DBへ加えた変更は失われますが、パソコン上のNode.js / TypeScriptソース、帳票定義、初期化SQLは消えません。DBは次の起動で初期データから作り直されます。01はDBを使いません。

削除できたか確認します。

```sh
docker compose ps -a
docker image ls reports-web-node-03-api
```

コンテナーとイメージの一覧が、どちらも見出しだけなら削除済みです。01・02・03を全部片付けたい場合は、各フォルダーでこの削除手順を実行してください。

**他のサンプルでも使うNode.js・PostgreSQLなどの基本イメージと、ビルドキャッシュは残します。** これらは起動中のアプリではないため、残っていてもURLは開けません。他の作業を巻き込むDocker全体の一括削除は不要です。

再確認するときは、第2節の起動コマンドを実行してからURLを開きます。ビルドキャッシュも使わず、サンプルのビルド手順を確認したい場合は次を使えます。

```sh
docker compose build --no-cache
docker compose up -d --wait --wait-timeout 180
```

参考：[Docker公式の削除オプション](https://docs.docker.com/reference/cli/docker/compose/down/)。

## 困ったとき

- **dockerが見つからない／接続できない**：Docker Desktop、またはLinuxのDockerサービスが起動しているか確認し、新しいターミナルで `docker version` を実行します。Linuxで権限エラーになる場合は、Dockerの導入手順に従って実行ユーザーの権限も確認してください。
- **ポートが使用中**：`docker ps` で、すでに同じサンプルが起動していないか確認します。別環境が使っている場合は、このフォルダーに `.env` を作り、例えば `SAMPLE_PORT=19302` と書いて再度起動します。その場合のURLもその番号になります。
- **エンジンのイメージを取得できない**：インターネットに接続した状態で `docker pull ghcr.io/reportsweb/engine:1.0.1` が成功するか確認します。
- **画面が開かない／帳票が出ない**：`docker compose ps` と `docker compose logs --tail=50` を確認します。起動に失敗したままURLだけ開き直しても直りません。
- **Node.js / TypeScriptの処理を追いたい**：`docker compose logs -f api`でログを見られます。Ctrl+Cはログ表示を終了するだけで、サーバーは停止しません。

## 共通のファイルについて

帳票エンジンとブラウザー用のランタイム（デザイナー・プレビュー画面）は、Docker イメージ `ghcr.io/reportsweb/engine:1.0.1` から取得します。DBの初期化SQLは`../common/database/`に一度だけ入っています。郵便番号などのデータもSQL内に収録され、起動時に自動で登録されます。

**起動するコンテナーはサンプルごとに独立しています。** DBもこのサンプル専用に作るので、このサンプルを止めたり変更したりしても他のサンプルへ影響しません。共通のファイルを読むことと、同じ起動中のサーバーを使うことは別です。
