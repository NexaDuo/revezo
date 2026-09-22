import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, AlignmentType, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import { Escala } from './solver/types';

export const exportToWord = async (escala: Escala, dias: string[]) => {
  const turnos = [
    { key: 'manha', titulo: 'Manhã (M)' },
    { key: 'tarde', titulo: 'Tarde (T)' },
    { key: 'noite', titulo: 'Noite (N)' }
  ];

  const children: any[] = [
    new Paragraph({
      text: 'Grade da Semana',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    })
  ];

  for (const { key, titulo } of turnos) {
    children.push(
      new Paragraph({
        text: titulo,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 }
      })
    );

    const isNoite = key === 'noite';
    const sourceData = isNoite ? {} : ((escala as any)[key] || {});
    const sitios = Object.keys(sourceData);

    if (isNoite) {
      const rows = [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ text: 'Sítio', alignment: AlignmentType.CENTER, style: 'Strong' })],
              width: { size: 20, type: WidthType.PERCENTAGE },
            }),
            ...dias.map(d => new TableCell({
              children: [new Paragraph({ text: d, alignment: AlignmentType.CENTER, style: 'Strong' })],
              width: { size: 80 / dias.length, type: WidthType.PERCENTAGE },
            }))
          ],
          tableHeader: true
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph('Sem sítios noturnos')],
            }),
            ...dias.map(() => new TableCell({ children: [new Paragraph('')] }))
          ]
        })
      ];
      children.push(
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE }
        })
      );
      continue;
    }

    if (sitios.length === 0) {
      children.push(new Paragraph('Nenhum sítio neste turno.'));
      continue;
    }

    const rows = [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: 'Sítio', alignment: AlignmentType.CENTER, style: 'Strong' })],
            width: { size: 20, type: WidthType.PERCENTAGE },
          }),
          ...dias.map(d => new TableCell({
            children: [new Paragraph({ text: d, alignment: AlignmentType.CENTER, style: 'Strong' })],
            width: { size: 80 / dias.length, type: WidthType.PERCENTAGE },
          }))
        ],
        tableHeader: true
      })
    ];

    for (const sitio of sitios) {
      const cells = [
        new TableCell({
          children: [new Paragraph({ text: sitio, style: 'Strong' })]
        })
      ];

      for (let i = 0; i < dias.length; i++) {
        const nomes = sourceData[sitio][i] || [];
        cells.push(
          new TableCell({
            children: nomes.map((nome: string) => new Paragraph(nome))
          })
        );
      }

      rows.push(new TableRow({ children: cells }));
    }

    children.push(
      new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE }
      })
    );
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'escala.docx');
};
