import {
    Entity,
    PrimaryGeneratedColumn,
    Column
} from "typeorm";

export enum TipoUsuario {
    COMUM = "COMUM",
    PROPRIETARIO = "PROPRIETARIO",
    ADMIN = "ADMIN"
}

@Entity("usuario")
export class Usuario {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @Column({ unique: true })
    email!: string;

    @Column()
    senha!: string;

    @Column({ nullable: true })
    telefone!: string;

    @Column({
        type: "text",
        default: TipoUsuario.COMUM
    })
    tipo!: TipoUsuario;

    @Column({ type: "blob", nullable: true, select: false })
    fotoDados!: Buffer | null;

    @Column({ type: "text", nullable: true })
    fotoTipo!: string | null;

    @Column({ type: "text", nullable: true, unique: true })
    asaasWalletId!: string | null;
}