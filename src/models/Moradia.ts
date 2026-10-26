import {
    Entity,
    PrimaryGeneratedColumn,
    Column
} from "typeorm";

@Entity("moradia")
export class Moradia {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    titulo!: string;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    preco!: number;

    @Column({ default: "Próximo ao IFES" })
    distancia!: string;

    @Column({ default: "Santa Teresa" })
    bairro!: string;

    @Column({ default: "Casa" })
    tipo!: string;

    @Column({ default: 1 })
    quartos!: number;

    @Column({ default: 1 })
    banheiros!: number;

    @Column({ default: 1 })
    vagas!: number;

    @Column({ default: "Contato via plataforma" })
    telefone!: string;

    @Column({ default: "Próximo ao campus" })
    localizacao!: string;

    @Column({ type: "text", default: "" })
    descricao!: string;

    @Column()
    imagem!: string;

    @Column({ type: "blob", nullable: true, select: false })
    imagemDados!: Buffer | null;

    @Column({ type: "text", nullable: true })
    imagemTipo!: string | null;

    @Column({ type: "text", default: "[]" })
    comodidades!: string;

    @Column({ default: false })
    demonstracao!: boolean;

    @Column({ type: "integer", nullable: true })
    proprietarioId!: number | null;

    @Column({ default: true })
    disponivel!: boolean;

    @Column({ default: false })
    destaque!: boolean;
}