EXPLAIN ANALYZE output for the query `WHERE event_id = <some-event-id> AND status = 'confirmed'`:

[
  'QUERY PLAN',
  '-----------------------------------------------------------------------------------------------------------------------------------',
  'Bitmap Heap Scan on public.payments  (cost=8.63..22.01 rows=6 width=398) (actual time=0.025..0.026 rows=0 loops=1)',
  '  Recheck Cond: (((eventId)::text = \'some-event-id\'::text) AND (status = \'confirmed\'::public.payments_status_enum))',
  '  ->  Bitmap Index Scan on IDX_e2955a10175f13b64d1e3506b5  (cost=0.00..8.63 rows=6 width=0) (actual time=0.024..0.024 rows=0 loops=1)',
  '        Index Cond: (((eventId)::text = \'some-event-id\'::text) AND (status = \'confirmed\'::public.payments_status_enum))',
  'Planning Time: 0.135 ms',
  'Execution Time: 0.046 ms',
]