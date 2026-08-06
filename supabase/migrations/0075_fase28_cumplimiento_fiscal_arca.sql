-- ============================================================
-- Migración 0075: Cumplimiento fiscal ARCA (Fase 28)
-- Edgy Gestión
--
-- Contexto: Anexo II de la RG (AFIP/ARCA) 1415/2003 exige que TODO
-- comprobante clase A/B/C imprima, además de CUIT y domicilio, el
-- número de inscripción en Ingresos Brutos (o condición de no
-- contribuyente) y la fecha de inicio de actividades, precedida de la
-- leyenda "INICIO DE ACTIVIDADES". `clientes.inicio_actividades` ya
-- existía (Configuración > Empresa > Datos fiscales) pero nunca se
-- imprimía en el PDF; Ingresos Brutos no existía en ningún lado.
--
-- Además, la RG 5614/2024 (Régimen de Transparencia Fiscal al
-- Consumidor, Ley 27.743) exige que las facturas tipo B de
-- Responsables Inscriptos muestren un bloque "IVA Contenido", y las
-- provincias que adhieran pueden sumar la alícuota de Ingresos Brutos.
-- Como el nomenclador de alícuotas de IIBB por rubro/provincia excede
-- el alcance de este sistema (y cambia con el tiempo), se deja como un
-- valor que carga el propio cliente/contador -- mismo criterio que ya
-- se usa para el certificado ARCA (dato provisto por el cliente, no
-- calculado por Edgy).
--
-- `provincia` (agregada en una migración anterior, Fase 16/Empresa) se
-- reutiliza como jurisdicción de Ingresos Brutos -- no hace falta un
-- campo aparte.
--
-- Estas columnas son de edición libre del propio cliente en
-- Configuración > Empresa (no forman parte del set protegido
-- slug/estado/cuit/tipo_negocio del trigger proteger_columnas_sensibles_clientes).
-- ============================================================

alter table edgy_gestion.clientes
  add column if not exists ingresos_brutos_condicion text
    check (ingresos_brutos_condicion in (
      'inscripto_local', 'inscripto_convenio_multilateral', 'exento', 'no_contribuyente'
    )),
  add column if not exists ingresos_brutos_numero text,
  add column if not exists mostrar_iibb_alicuota boolean not null default false,
  add column if not exists iibb_alicuota numeric(5,2);

comment on column edgy_gestion.clientes.ingresos_brutos_condicion is
  'Condición del NEGOCIO ante Ingresos Brutos -- Anexo II RG 1415: "N° de inscripción ... o condición de NO CONTRIBUYENTE". No confundir con clientes_arca_config.condicion_iva (esa es la condición ante IVA).';
comment on column edgy_gestion.clientes.ingresos_brutos_numero is
  'Número de inscripción en IIBB. En Convenio Multilateral suele coincidir con el CUIT, pero se permite cargarlo distinto por si el cliente tiene un número local.';
comment on column edgy_gestion.clientes.mostrar_iibb_alicuota is
  'RG 5614/2024 (Transparencia Fiscal al Consumidor): algunas provincias que adhirieron exigen mostrar la alícuota de IIBB en facturas B a consumidor final. Apagado por defecto -- se activa solo si la jurisdicción del cliente lo exige (ver iibb_alicuota).';
comment on column edgy_gestion.clientes.iibb_alicuota is
  'Alícuota (%) de IIBB a mostrar en el comprobante cuando mostrar_iibb_alicuota=true. Valor provisto por el cliente/contador -- Edgy no calcula alícuotas por rubro/provincia.';

-- ─── Verificación ────────────────────────────────────────────
select id, ingresos_brutos_condicion, ingresos_brutos_numero, mostrar_iibb_alicuota, iibb_alicuota
from edgy_gestion.clientes
limit 5;
