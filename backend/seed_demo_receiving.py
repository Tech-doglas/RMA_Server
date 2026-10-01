"""Add a labeled demo batch to the local database once, without replacing data."""
import argparse
import json
import sqlite3
import uuid
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path


MARKER = '[DEMO receiving-v1]'
DATABASE = Path(__file__).resolve().parent / 'storage' / 'rma.sqlite3'


def seed(count=100, batch='receiving-v1'):
    if count < 100 or count % 100:
        raise ValueError('Use a positive multiple of 100 for the demo record count.')
    marker = f'[DEMO {batch}]'
    if not DATABASE.is_file():
        raise RuntimeError('Start the local backend first to initialize its database.')
    connection = sqlite3.connect(DATABASE, timeout=15)
    try:
        existing = connection.execute('SELECT COUNT(*) FROM RMA_return_units WHERE remark LIKE ?', (marker + '%',)).fetchone()[0]
        if existing:
            if existing != count:
                raise RuntimeError(f'Found {existing} demo units. No records were changed; review the existing demo set before reseeding.')
            print(json.dumps({'created': 0, 'existingDemoUnits': existing, 'message': f'The {count} demo units already exist.'}))
            return

        backup_folder = DATABASE.parent / 'backups'
        backup_folder.mkdir(exist_ok=True)
        backup_path = backup_folder / ('before-demo-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.sqlite3')
        with sqlite3.connect(backup_path) as backup:
            connection.backup(backup)

        connection.execute('BEGIN IMMEDIATE')
        # Check again after acquiring the write lock in case another seed ran.
        if connection.execute('SELECT COUNT(*) FROM RMA_return_units WHERE remark LIKE ?', (marker + '%',)).fetchone()[0]:
            connection.rollback()
            raise RuntimeError('A demo set was added by another process. No additional records were created.')
        run_id = uuid.uuid4().hex[:8]
        sizes = ([1] * 40 + [2] * 10 + [5] * 8) * (count // 100)
        models = ['Dell Latitude 5420', 'Lenovo ThinkPad T14', 'HP EliteBook 840 G8',
                  'Apple MacBook Air M1', 'Acer Aspire 5', 'ASUS VivoBook 15',
                  'Dell Inspiron 15', 'Lenovo IdeaPad 3']
        bulk_types = ['REGULAR', 'BULK_NEW']
        companies = ['SNOWBELL/XIE/PITY TECH', 'PX/LEO/KRIZY', 'SNOWBELL/XIE/PITY TECH', 'Others']
        receiving_notes = ['Customer return in original packaging.', 'Open box with charger included.',
                           'Packaging damaged; laptop protected.', 'Charger missing; check accessories.',
                           'Bulk delivery for refurbishment.']
        max_batch = connection.execute('SELECT COALESCE(MAX(shipBatchNumber), 0) FROM RMA_return_units').fetchone()[0]
        states = Counter()
        ids = []
        index = 0
        for delivery, quantity in enumerate(sizes):
            local_delivery = delivery % 58
            # Separate deliveries can share tracking, testing the grouped listing.
            tracking_index = delivery - 1 if local_delivery in (9, 19, 29) else delivery
            tracking = '' if local_delivery in (3, 13, 23, 33, 50, 51) else f'DEMO-{run_id}-TRK-{tracking_index + 1:04}'
            group = f'g_demo_{run_id}_{delivery + 1:03}'
            bulk = bulk_types[tracking_index % len(bulk_types)]
            company = companies[tracking_index % len(companies)]
            received = date(2026, 4, 1) + timedelta(days=(delivery * 7) % 177)
            for unit in range(quantity):
                inspection = shipped = serial = pallet = inspection_remark = None
                batch_number = batch = None
                local_index = index % 100
                state = 'Awaiting inspection' if local_index < 40 else 'Inspected' if local_index < 75 else 'Shipped'
                if state == 'Shipped':
                    batch_offset = (local_index - 75) // 5
                    shipped = date(2026, 9, 20) + timedelta(days=batch_offset * 2)
                    received_unit = shipped - timedelta(days=7)
                    batch_number = max_batch + (index // 100) * 5 + batch_offset + 1
                    batch = 'ship.' + str(batch_number).zfill(4)
                else:
                    received_unit = received
                if state != 'Awaiting inspection':
                    inspection = received_unit + timedelta(days=2)
                    serial = f'DEMO-{run_id}-SN-{index + 1:04}'
                    pallet = '' if state == 'Inspected' and index % 6 == 0 else f'DEMO-P{delivery % 40 + 1:02}'
                    inspection_remark = ['Power-on test passed.', 'Cosmetic wear; functionality checked.',
                                         'Battery tested; charger verified.', 'Keyboard and display checked.'][index % 4]
                remark = f'{marker} Delivery {delivery + 1}, unit {unit + 1}/{quantity}. ' + receiving_notes[delivery % len(receiving_notes)]
                cursor = connection.execute('''INSERT INTO RMA_return_units
                    (timestamp, tracking, laptop, receivedDate, remark, inspectionDate, pallet,
                     serial, serialKey, groupId, unitIndex, inspectionRemark, shipDate,
                     shipBatch, shipBatchNumber, bulkType, company)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
                    received_unit.isoformat() + ' 10:00:00', tracking, models[index % len(models)],
                    received_unit.isoformat(), remark, inspection.isoformat() if inspection else None,
                    pallet or '', serial or '', serial.lower() if serial else None, group, unit + 1,
                    inspection_remark or '', shipped.isoformat() if shipped else None,
                    batch or '', batch_number, bulk, company,
                ))
                ids.append(cursor.lastrowid)
                states[state] += 1
                index += 1
        assert len(ids) == count
        connection.commit()
        print(json.dumps({'created': len(ids), 'deliveries': len(sizes), 'statuses': states,
                          'firstFileNo': 'sid-' + str(ids[0]).zfill(4),
                          'lastFileNo': 'sid-' + str(ids[-1]).zfill(4), 'backup': str(backup_path)}))
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--count', type=int, default=100)
    parser.add_argument('--batch', default='receiving-v1')
    arguments = parser.parse_args()
    seed(arguments.count, arguments.batch)
