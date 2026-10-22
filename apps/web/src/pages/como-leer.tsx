import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { REPO_URL } from "../components/layout.tsx";
import { PageHeader } from "../components/ui.tsx";

const Item = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2 border-t border-line py-6">
    <h2 className="text-lg font-semibold">{title}</h2>
    <div className="flex max-w-2xl flex-col gap-2 text-muted text-pretty">{children}</div>
  </div>
);

export function ComoLeerPage() {
  return (
    <div className="flex flex-col">
      <PageHeader topic="Cómo leer los datos" title="Qué significa cada número">
        Los criterios son los mismos para todos los organismos y todos los años. Si algo no está claro o encontrás un error,{" "}
        <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
          contanos
        </a>
        .
      </PageHeader>

      <Item title="Proceso y adjudicación">
        <p>
          Un <strong>proceso</strong> es una compra: una licitación, una contratación directa o una contratación menor. Puede tener varios
          lotes, y cada lote se adjudica a un proveedor. Una <strong>adjudicación</strong> es un lote ganado: por eso hay muchas más
          adjudicaciones que procesos.
        </p>
      </Item>

      <Item title="Lo adjudicado no es lo gastado">
        <p>
          Lo adjudicado es lo que el organismo decidió comprarle a cada proveedor, por <strong>toda la duración del contrato</strong>, y se
          cuenta en el año en que se adjudicó. Un servicio contratado por cuatro años aparece entero en un solo año: por eso hay años con
          picos, como 2018 y 2023, cuando se renovaron varios contratos grandes de comida, seguridad y mantenimiento.
        </p>
        <p>
          Después de adjudicado, un contrato puede cambiar: se le redeterminan los precios por inflación, se amplía, se prorroga o se
          rescinde antes de tiempo. Esos cambios se publican en el Boletín Oficial, no en Buenos Aires Compras, y los pagos no están en
          estos datos. Lo que se gastó cada año está en el presupuesto ejecutado, que todavía no sumamos.
        </p>
      </Item>

      <Item title="Pesos de cada año y pesos constantes">
        <p>
          Por defecto, los montos están en <strong>pesos de cada año</strong>, tal como los publica la Ciudad: un peso de 2017 vale lo mismo
          que uno de 2026. Con la inflación, eso hace que los años recientes parezcan mucho más grandes. Sirven para ordenar (quién compró
          más), no para comparar épocas.
        </p>
        <p>
          Con el selector «Montos en» se pueden ver en <strong>pesos constantes</strong>: cada compra se lleva a pesos del último mes
          publicado del IPC de INDEC (región GBA, la Ciudad y el conurbano), según el mes en que se adjudicó. Así los años se pueden
          comparar. El índice empieza en diciembre de 2016 y no se completa con otras series: en pesos constantes solo cuentan las compras
          desde 2017, y las anteriores quedan afuera.
        </p>
        <p>
          Las compras en dólares o euros aparecen en los gráficos por año, encima de las barras en pesos y en otro color: se convierten con
          la cotización promedio del BCRA del mes de cada adjudicación (y, en pesos constantes, después se ajustan por inflación). En los
          demás montos, como los totales y los rankings, no se suman: se informan aparte, en su moneda. Cuando Buenos Aires Compras no dice
          la moneda de una adjudicación, se toma la del proceso.
        </p>
      </Item>

      <Item title="Procedimientos">
        <p>
          <strong>Licitación pública:</strong> convocatoria abierta a cualquier proveedor. <strong>Licitación privada:</strong> solo a
          invitados. <strong>Contratación directa:</strong> el organismo elige a quién comprarle, en los casos que la ley permite.{" "}
          <strong>Contratación menor:</strong> trámite simplificado para montos chicos. Es la clasificación que publica Buenos Aires
          Compras.
        </p>
      </Item>

      <Item title="Estados de una compra">
        <p>
          <strong>Terminado:</strong> se completó. <strong>En curso:</strong> todavía abierto. <strong>Dejado sin efecto:</strong> se
          canceló. <strong>Desierto o fracasado:</strong> nadie se presentó o ninguna oferta servía.
        </p>
      </Item>

      <Item title="Datos personales">
        <p>
          De las empresas se muestran razón social, CUIT y lo que ganaron. Las personas humanas que le venden a la Ciudad (CUIT que empieza
          con 20, 23, 24 o 27) solo aparecen en los totales: su CUIT lleva el DNI y no armamos fichas de particulares.
        </p>
        <p>
          Algunos hospitales ponen en el título de la compra el nombre del paciente para el que compran. Esos títulos se ocultan y se marcan
          como «título oculto»; el resto de la compra se muestra igual.
        </p>
      </Item>

      <Item title="Señales">
        <p>
          Una <Link to="/senales">señal</Link> es un patrón que merece una explicación, no una acusación. Cada una dice cómo se calculó,
          lista los casos y trae al lado lo que podría explicarla sin que haya nada raro.
        </p>
      </Item>

      <Item title="De dónde sale cada número">
        <p>
          Todo sale de publicaciones oficiales del Gobierno de la Ciudad. Cada archivo se guarda tal cual llegó, con la fecha de descarga y
          su huella sha256, antes de ordenarlo. En <Link to="/fuentes">Fuentes</Link> está cada fuente y en <Link to="/datos">Datos</Link>,
          los archivos ordenados para descargar.
        </p>
      </Item>
    </div>
  );
}
