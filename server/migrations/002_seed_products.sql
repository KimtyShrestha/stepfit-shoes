-- ============================================================
-- Seed catalogue. Safe to re-run: ON CONFLICT guards duplicates.
-- ============================================================

INSERT INTO products (name, brand, description, price_cents, stock, image_url) VALUES
('Velocity Runner 2',  'StepFit',  'Lightweight daily trainer with a responsive foam midsole. Built for tempo runs and everyday mileage.', 8999,  25, 'https://picsum.photos/seed/velocity/600/400'),
('Trail Grip Pro',     'StepFit',  'Aggressive lug pattern and a reinforced toe cap for wet rock and loose gravel.',                        12499, 12, 'https://picsum.photos/seed/trailgrip/600/400'),
('Court Classic Low',  'Northline','Clean leather silhouette with a vulcanised rubber sole. An everyday staple.',                          6999,  40, 'https://picsum.photos/seed/courtlow/600/400'),
('Cloudstep Recovery', 'Northline','Oversized cushioning designed for rest days and post-run recovery walks.',                             10999, 18, 'https://picsum.photos/seed/cloudstep/600/400'),
('Arc Trainer X',      'Meridian', 'Stable cross-training shoe with a flat heel and a wide platform for lifting.',                         11499, 9,  'https://picsum.photos/seed/arctrainer/600/400'),
('Marathon Elite 4',   'Meridian', 'Carbon-plated racing shoe engineered for road marathon distances.',                                   21999, 5,  'https://picsum.photos/seed/marathon/600/400')
ON CONFLICT DO NOTHING;