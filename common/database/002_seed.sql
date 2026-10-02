BEGIN;
INSERT INTO reports_sample_rows(sample_key,row_no,label,quantity,amount) VALUES
('estimate',1,'Reports Web 開発ライセンス',1,48000),('estimate',2,'年間サポート',1,12000),('estimate',3,'導入支援',2,15000),
('invoice',1,'Reports Web 月額利用料',1,30000),('invoice',2,'追加帳票作成',3,8000),
('products',1,'帳票エンジン',1,48000),('products',2,'Webデザイナー',1,36000),('products',3,'Webプレビュアー',1,24000),
('postal',1,'100-0001 東京都千代田区千代田',1,0),('postal',2,'105-0011 東京都港区芝公園',1,0),('postal',3,'530-0001 大阪府大阪市北区梅田',1,0),
('multiples-of-ten',1,'10',1,10),('multiples-of-ten',2,'20',1,20),('multiples-of-ten',3,'30',1,30),('multiples-of-ten',4,'40',1,40),('multiples-of-ten',5,'50',1,50)
ON CONFLICT (sample_key,row_no) DO UPDATE SET label=EXCLUDED.label,quantity=EXCLUDED.quantity,amount=EXCLUDED.amount;
COMMIT;
