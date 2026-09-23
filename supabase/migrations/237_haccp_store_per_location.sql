-- Applied to production via the Supabase MCP on 23-09-2026 (migrations haccp_store_per_location
-- + haccp_remap_moved_readings). Reference copy; the statements are idempotent.
--
-- Since 063 every location had haccp_store_id = 1 (the column default), so the HACCP lists of all
-- three restaurants landed in one pile. The app already reads the store from the selected location
-- (src/lib/haccp/types.ts getHaccpStoreId); only the data was missing.
update public.locations set haccp_store_id = 2 where name = 'Mima Pijp';
update public.locations set haccp_store_id = 3 where name = 'Mima Zuidas';

-- Start De Pijp and Zuidas with West's equipment and supplier list; adjust per kitchen in /admin/haccp-equipment.
insert into public.haccp_store_equipment (store_id, sort_order, label, norm_display, norm_kind, norm_value, show_fifo, show_exact_temp)
select s.store_id, e.sort_order, e.label, e.norm_display, e.norm_kind, e.norm_value, e.show_fifo, e.show_exact_temp
from public.haccp_store_equipment e cross join (values (2), (3)) s(store_id)
where e.store_id = 1 and not exists (select 1 from public.haccp_store_equipment x where x.store_id = s.store_id);

insert into public.haccp_leveranciers (store_id, naam, adres, telefoon, fax, email, website, kwaliteitssysteem, kwaliteitssysteem_naam,
  gecertificeerd, eg_nummer, voldoet_wetgeving, specifieke_afspraken, contactpersoon, contact_telefoon, contact_email,
  datum_ondertekend, handtekening_url, audit_document_path, audit_document_paths)
select s.store_id, l.naam, l.adres, l.telefoon, l.fax, l.email, l.website, l.kwaliteitssysteem, l.kwaliteitssysteem_naam,
  l.gecertificeerd, l.eg_nummer, l.voldoet_wetgeving, l.specifieke_afspraken, l.contactpersoon, l.contact_telefoon, l.contact_email,
  l.datum_ondertekend, l.handtekening_url, l.audit_document_path, l.audit_document_paths
from public.haccp_leveranciers l cross join (values (2), (3)) s(store_id)
where l.store_id = 1 and not exists (select 1 from public.haccp_leveranciers x where x.store_id = s.store_id);

-- Weeks 38 and 39 of 2026 were filled in on 21-09 and signed "dh" (Danny, De Pijp): moved to De Pijp,
-- with the temperature readings re-pointed at De Pijp's copies of the equipment.
update public.haccp_temperaturen set store_id = 2 where store_id = 1 and year = 2026 and week_number in (38, 39);
update public.haccp_ingangscontrole set store_id = 2 where store_id = 1 and year = 2026 and week_number in (38, 39);
update public.haccp_schoonmaak set store_id = 2 where store_id = 1 and year = 2026 and week_number in (38, 39);
update public.haccp_bereiden set store_id = 2 where store_id = 1 and year = 2026 and week_number in (38, 39);
