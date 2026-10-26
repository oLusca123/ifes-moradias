"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoradiaController = void 0;
const BDConn_1 = require("../services/BDConn");
const Moradia_1 = require("../models/Moradia");
class MoradiaController {
    static async image(req, res) {
        try {
            const id = Number(req.params.id);
            const moradia = await BDConn_1.BancoDeDados.getRepository(Moradia_1.Moradia)
                .createQueryBuilder("moradia")
                .addSelect("moradia.imagemDados")
                .where("moradia.id = :id", { id })
                .getOne();
            if (!moradia || !moradia.imagemDados || !moradia.imagemTipo) {
                return res.status(404).send("Imagem não encontrada.");
            }
            return res
                .type(moradia.imagemTipo)
                .set("X-Content-Type-Options", "nosniff")
                .set("Cache-Control", "private, max-age=3600")
                .send(moradia.imagemDados);
        }
        catch (error) {
            console.error("Erro ao carregar imagem da moradia:", error);
            return res.status(500).send("Erro ao carregar imagem.");
        }
    }
    static async seedDadosIniciais() {
        const repo = BDConn_1.BancoDeDados.getRepository(Moradia_1.Moradia);
        const exemplos = [
            {
                titulo: "Quarto mobiliado para estudante",
                preco: 380,
                distancia: "Acesso pela região do campus",
                bairro: "São João de Petrópolis",
                tipo: "Quarto",
                quartos: 1,
                banheiros: 1,
                vagas: 0,
                telefone: "",
                localizacao: "São João de Petrópolis, próximo ao comércio local",
                descricao: "Exemplo ilustrativo de quarto simples em casa compartilhada. Inclui cama, guarda-roupa e uso compartilhado da cozinha e do banheiro. Combine contas e regras da casa diretamente com o proprietário.",
                imagem: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
                comodidades: JSON.stringify(["mobilia", "cozinha"]),
                demonstracao: true,
                disponivel: true,
                destaque: false
            },
            {
                titulo: "Vaga em quarto compartilhado",
                preco: 300,
                distancia: "Trajeto a confirmar",
                bairro: "Barracão",
                tipo: "Quarto",
                quartos: 1,
                banheiros: 1,
                vagas: 0,
                telefone: "",
                localizacao: "Região de Barracão",
                descricao: "Exemplo ilustrativo de vaga em quarto compartilhado para quem busca dividir despesas. O valor de demonstração não inclui contas; confirme disponibilidade, regras, mobiliário e transporte antes de fechar qualquer contrato.",
                imagem: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
                comodidades: JSON.stringify(["cozinha"]),
                demonstracao: true,
                disponivel: true,
                destaque: false
            },
            {
                titulo: "Quarto individual com cozinha compartilhada",
                preco: 450,
                distancia: "A combinar",
                bairro: "São João de Petrópolis",
                tipo: "Quarto",
                quartos: 1,
                banheiros: 1,
                vagas: 0,
                telefone: "",
                localizacao: "São João de Petrópolis",
                descricao: "Exemplo de quarto individual em residência compartilhada, pensado para a rotina de quem estuda. Cozinha e lavanderia de uso comum. Converse sobre contas, horários e uso dos espaços.",
                imagem: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80",
                comodidades: JSON.stringify(["lavanderia", "cozinha"]),
                demonstracao: true,
                disponivel: true,
                destaque: false
            },
            {
                titulo: "Kitnet compacta no centro de Santa Teresa",
                preco: 650,
                distancia: "Verificar trajeto até o campus",
                bairro: "Santa Teresa",
                tipo: "Kitnet",
                quartos: 1,
                banheiros: 1,
                vagas: 0,
                telefone: "",
                localizacao: "Área central de Santa Teresa",
                descricao: "Exemplo ilustrativo de kitnet pequena com ambiente integrado e cozinha compacta. Considere o deslocamento até o campus e confirme quais despesas estão incluídas no aluguel.",
                imagem: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80",
                comodidades: JSON.stringify(["cozinha"]),
                demonstracao: true,
                disponivel: true,
                destaque: false
            },
            {
                titulo: "Quarto simples perto do comércio",
                preco: 350,
                distancia: "Confirmar opções de transporte",
                bairro: "Patrimônio",
                tipo: "Quarto",
                quartos: 1,
                banheiros: 1,
                vagas: 0,
                telefone: "",
                localizacao: "Região do Patrimônio",
                descricao: "Exemplo ilustrativo de quarto econômico em casa compartilhada. O acesso ao banheiro e à cozinha é comum. Confirme a rota, os horários de transporte e as despesas antes de combinar uma visita.",
                imagem: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=900&q=80",
                comodidades: JSON.stringify(["cozinha"]),
                demonstracao: true,
                disponivel: true,
                destaque: false
            },
            {
                titulo: "Casa compartilhada para dividir despesas",
                preco: 520,
                distancia: "Deslocamento a confirmar",
                bairro: "São Roque",
                tipo: "Quarto",
                quartos: 1,
                banheiros: 1,
                vagas: 0,
                telefone: "",
                localizacao: "Região de São Roque",
                descricao: "Exemplo de quarto em casa compartilhada, com espaços comuns e quintal. O valor é apenas uma referência fictícia para demonstração; alinhe contas, transporte e regras de convivência.",
                imagem: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80",
                comodidades: JSON.stringify(["quintal", "cozinha"]),
                demonstracao: true,
                disponivel: true,
                destaque: false
            },
            {
                titulo: "Kitnet básica para uma pessoa",
                preco: 580,
                distancia: "A combinar",
                bairro: "Barracão",
                tipo: "Kitnet",
                quartos: 1,
                banheiros: 1,
                vagas: 0,
                telefone: "",
                localizacao: "Barracão, São João de Petrópolis",
                descricao: "Exemplo ilustrativo de kitnet compacta com quarto e cozinha no mesmo ambiente. Boa para uma pessoa que prefere ter seu próprio espaço. Verifique abastecimento de água, internet e transporte.",
                imagem: "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=900&q=80",
                comodidades: JSON.stringify(["cozinha"]),
                demonstracao: true,
                disponivel: true,
                destaque: false
            },
            {
                titulo: "Quarto mobiliado com contas combinadas",
                preco: 480,
                distancia: "Trajeto não informado",
                bairro: "Santa Teresa",
                tipo: "Quarto",
                quartos: 1,
                banheiros: 1,
                vagas: 0,
                telefone: "",
                localizacao: "Santa Teresa",
                descricao: "Exemplo de quarto mobiliado em residência compartilhada. Contas e regras de uso dos espaços devem ser combinadas. O anúncio é fictício e serve somente para demonstrar a plataforma.",
                imagem: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
                comodidades: JSON.stringify(["mobilia", "wifi"]),
                demonstracao: true,
                disponivel: true,
                destaque: false
            },
            {
                titulo: "Casa pequena para compartilhar",
                preco: 760,
                distancia: "Confirmar trajeto ao campus",
                bairro: "São João de Petrópolis",
                tipo: "Casa",
                quartos: 2,
                banheiros: 1,
                vagas: 0,
                telefone: "",
                localizacao: "São João de Petrópolis",
                descricao: "Exemplo ilustrativo de casa simples com dois quartos, destinada a pessoas que queiram dividir o aluguel. Combine a divisão do valor, das contas e das tarefas domésticas.",
                imagem: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=900&q=80",
                comodidades: JSON.stringify(["cozinha", "quintal"]),
                demonstracao: true,
                disponivel: true,
                destaque: false
            }
        ];
        for (const exemplo of exemplos) {
            const existente = await repo.findOne({
                where: {
                    titulo: exemplo.titulo,
                    demonstracao: true
                }
            });
            if (!existente) {
                await repo.save(repo.create(exemplo));
            }
        }
    }
    static getInformacoesUteis() {
        const mapsSearch = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
        const campus = 'IFES Campus Santa Teresa, Espírito Santo';
        const regions = [
            'Barracão (São João de Petrópolis), Santa Teresa, ES',
            'Santa Teresa, ES',
            'Patrimônio, Santa Teresa, ES',
            'São Roque, Santa Teresa, ES'
        ];
        return [
            {
                categoria: 'transporte',
                icone: '🚌',
                titulo: 'Consultar horários de ônibus',
                localidade: 'Santa Teresa e distritos',
                descricao: 'Consulte as informações mais recentes e confirme o horário com a viação antes de viajar. Os horários podem mudar.',
                acao: 'Pesquisar horários',
                link: `https://www.google.com/search?q=${encodeURIComponent('horários ônibus Santa Teresa ES São João de Petrópolis')}`
            },
            ...regions.map((region) => ({
                categoria: 'transporte',
                icone: '🧭',
                titulo: `Trajeto ao IFES: ${region.split(',')[0]}`,
                localidade: 'Rota em transporte público',
                descricao: 'Veja as opções de rota e o tempo estimado até o campus. Confira a disponibilidade do transporte para o dia da viagem.',
                acao: 'Ver rota',
                link: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(region)}&destination=${encodeURIComponent(campus)}&travelmode=transit`
            })),
            ...regions.map((region) => ({
                categoria: 'comercio',
                icone: '🛒',
                titulo: `Mercados e padarias`,
                localidade: region.split(',')[0],
                descricao: 'Encontre estabelecimentos próximos, veja avaliações e confira no mapa os horários informados.',
                acao: 'Ver no mapa',
                link: mapsSearch(`mercados e padarias em ${region}`)
            })),
            ...regions.map((region) => ({
                categoria: 'saude',
                icone: '💊',
                titulo: `Farmácias e unidades de saúde`,
                localidade: region.split(',')[0],
                descricao: 'Consulte os serviços de saúde próximos. Ligue para confirmar atendimento, horário e disponibilidade.',
                acao: 'Buscar atendimento',
                link: mapsSearch(`farmácia unidade de saúde em ${region}`)
            })),
            {
                categoria: 'campus',
                icone: '🎓',
                titulo: 'Serviços e avisos do campus',
                localidade: 'IFES Campus Santa Teresa',
                descricao: 'Acesse o portal oficial para consultar notícias, contatos e informações acadêmicas do campus.',
                acao: 'Abrir portal do IFES',
                link: 'https://santateresa.ifes.edu.br/'
            },
            {
                categoria: 'seguranca',
                icone: '🚨',
                titulo: 'Emergências',
                localidade: 'Brasil',
                descricao: 'Polícia Militar: 190 · SAMU: 192 · Bombeiros: 193. Em caso de emergência, ligue diretamente.',
                acao: 'Ligar para 190',
                link: 'tel:190'
            },
            {
                categoria: 'dicas',
                icone: '🔑',
                titulo: 'Antes de fechar o aluguel',
                localidade: 'Dicas para estudantes',
                descricao: 'Confirme o que está incluído no valor (água, energia e internet), visite o imóvel e teste o trajeto ao campus nos horários de aula.',
                acao: 'Ver checklist',
                link: '#checklist-aluguel'
            },
            {
                categoria: 'dicas',
                icone: '📍',
                titulo: 'Comércio e serviços por região',
                localidade: 'Barracão, São João de Petrópolis, Patrimônio e São Roque',
                descricao: 'Esses nomes identificam localidades da região; Barracão também é conhecido como São João de Petrópolis. Confira no mapa qual ponto fica mais perto do endereço do imóvel.',
                acao: 'Explorar localidades',
                link: mapsSearch('comércios e serviços perto de IFES Campus Santa Teresa, Espírito Santo')
            }
        ];
    }
    static async list(req, res) {
        try {
            await MoradiaController.seedDadosIniciais();
            const repo = BDConn_1.BancoDeDados.getRepository(Moradia_1.Moradia);
            const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : '';
            let moradias = [];
            if (busca) {
                const termo = `%${busca.toLowerCase()}%`;
                moradias = await repo
                    .createQueryBuilder('moradia')
                    .where('LOWER(moradia.titulo) LIKE :termo', { termo })
                    .orWhere('LOWER(moradia.bairro) LIKE :termo', { termo })
                    .orWhere('LOWER(moradia.tipo) LIKE :termo', { termo })
                    .orWhere('LOWER(moradia.distancia) LIKE :termo', { termo })
                    .orderBy('moradia.destaque', 'DESC')
                    .addOrderBy('moradia.id', 'DESC')
                    .getMany();
            }
            else {
                moradias = await repo.find({
                    order: {
                        destaque: 'DESC',
                        id: 'DESC'
                    }
                });
            }
            return res.render('moradias', {
                moradias,
                busca,
                informacoesUteis: MoradiaController.getInformacoesUteis(),
                usuario: req.session && req.session.usuarioNome ? {
                    nome: req.session.usuarioNome,
                    tipo: req.session.usuarioTipo,
                    foto: req.session.usuarioFoto
                } : null
            });
        }
        catch (error) {
            console.error('Erro ao listar moradias:', error);
            return res.status(500).send('Erro ao listar');
        }
    }
    static async show(req, res) {
        try {
            const id = Number(req.params.id);
            const repo = BDConn_1.BancoDeDados.getRepository(Moradia_1.Moradia);
            const moradia = await repo.findOne({ where: { id } });
            if (!moradia) {
                return res.status(404).send('Moradia não encontrada.');
            }
            return res.render('moradia_detalhes', {
                moradia,
                comodidades: JSON.parse(moradia.comodidades || '[]'),
                usuario: req.session && req.session.usuarioNome ? {
                    nome: req.session.usuarioNome,
                    tipo: req.session.usuarioTipo,
                    foto: req.session.usuarioFoto
                } : null
            });
        }
        catch (error) {
            console.error('Erro ao buscar moradia:', error);
            return res.status(500).send('Erro ao carregar moradia');
        }
    }
    static async novo(req, res) {
        return res.render('moradia_novo', {
            erro: null,
            form: {},
            usuario: req.session && req.session.usuarioNome ? {
                nome: req.session.usuarioNome,
                tipo: req.session.usuarioTipo,
                foto: req.session.usuarioFoto
            } : null
        });
    }
    static async create(req, res) {
        try {
            const { titulo, preco, distancia, bairro, tipo, descricao, banheiros, quartos, vagas, telefone, localizacao, comodidades } = req.body;
            const upload = req.file;
            const valor = Number(preco);
            const numeroQuartos = Number(quartos);
            const numeroBanheiros = Number(banheiros);
            const numeroVagas = Number(vagas);
            const texto = (value) => typeof value === "string" ? value.trim() : "";
            const tituloLimpo = texto(titulo);
            const bairroLimpo = texto(bairro);
            const localizacaoLimpa = texto(localizacao);
            const telefoneLimpo = texto(telefone);
            const descricaoLimpa = texto(descricao);
            const tipoLimpo = texto(tipo);
            const tiposPermitidos = ["Casa", "Apartamento", "Kitnet", "Quarto"];
            const formatos = {
                "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
                "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
            };
            const cabecalhoWebp = upload?.buffer.subarray(0, 4).toString() === "RIFF"
                && upload.buffer.subarray(8, 12).toString() === "WEBP";
            const formatoCorreto = upload
                && (upload.mimetype === "image/webp"
                    ? cabecalhoWebp
                    : formatos[upload.mimetype]
                        ? upload.buffer.subarray(0, formatos[upload.mimetype].length)
                            .equals(formatos[upload.mimetype])
                        : false);
            const dadosInvalidos = !tituloLimpo
                || tituloLimpo.length > 70
                || !Number.isFinite(valor)
                || valor <= 0
                || valor > 100000
                || !Number.isInteger(numeroQuartos)
                || numeroQuartos < 1
                || numeroQuartos > 20
                || !Number.isInteger(numeroBanheiros)
                || numeroBanheiros < 1
                || numeroBanheiros > 20
                || !Number.isInteger(numeroVagas)
                || numeroVagas < 0
                || numeroVagas > 20
                || !tiposPermitidos.includes(tipoLimpo)
                || !bairroLimpo
                || !localizacaoLimpa
                || !telefoneLimpo
                || telefoneLimpo.length > 20
                || !descricaoLimpa
                || descricaoLimpa.length > 1000;
            if (dadosInvalidos || !upload || !formatoCorreto) {
                return res.status(400).render('moradia_novo', {
                    erro: !upload
                        ? 'Adicione uma foto do imóvel para continuar.'
                        : !formatoCorreto
                            ? 'O arquivo enviado não parece ser uma imagem JPG, PNG ou WebP válida.'
                            : 'Confira os dados preenchidos e tente novamente.',
                    form: req.body || {},
                    usuario: req.session && req.session.usuarioNome ? {
                        nome: req.session.usuarioNome,
                        tipo: req.session.usuarioTipo,
                        foto: req.session.usuarioFoto
                    } : null
                });
            }
            const repo = BDConn_1.BancoDeDados.getRepository(Moradia_1.Moradia);
            const comodidadesRecebidas = Array.isArray(comodidades)
                ? comodidades
                : typeof comodidades === "string"
                    ? [comodidades]
                    : [];
            const comodidadesPermitidas = ["wifi", "mobilia", "cozinha", "lavanderia", "garagem", "quintal", "agua_inclusa", "energia_inclusa"];
            const comodidadesSelecionadas = comodidadesRecebidas.filter((item) => comodidadesPermitidas.includes(item));
            const nova = repo.create({
                titulo: tituloLimpo,
                preco: valor,
                distancia: distancia || 'Próximo ao IFES',
                imagem: '',
                imagemDados: upload.buffer,
                imagemTipo: upload.mimetype,
                proprietarioId: Number(req.session.usuarioId),
                bairro: bairroLimpo,
                tipo: tipoLimpo,
                descricao: descricaoLimpa,
                banheiros: numeroBanheiros,
                quartos: numeroQuartos,
                vagas: numeroVagas,
                telefone: telefoneLimpo,
                localizacao: localizacaoLimpa,
                comodidades: JSON.stringify(comodidadesSelecionadas),
                disponivel: true,
                destaque: false
            });
            await repo.save(nova);
            return res.redirect('/moradias');
        }
        catch (error) {
            console.error('Erro ao criar:', error);
            return res.status(500).send('Erro ao criar');
        }
    }
}
exports.MoradiaController = MoradiaController;
//# sourceMappingURL=MoradiaController.js.map