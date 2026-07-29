-- Replace external placeholder images with locally hosted assets.
-- Removes a third-party runtime dependency from the product catalogue.

UPDATE products SET image_url = '/shoes/velocity-runner-2.svg'  WHERE name = 'Velocity Runner 2';
UPDATE products SET image_url = '/shoes/trail-grip-pro.svg'     WHERE name = 'Trail Grip Pro';
UPDATE products SET image_url = '/shoes/court-classic-low.svg'  WHERE name = 'Court Classic Low';
UPDATE products SET image_url = '/shoes/cloudstep-recovery.svg' WHERE name = 'Cloudstep Recovery';
UPDATE products SET image_url = '/shoes/arc-trainer-x.svg'      WHERE name = 'Arc Trainer X';
UPDATE products SET image_url = '/shoes/marathon-elite-4.svg'   WHERE name = 'Marathon Elite 4';