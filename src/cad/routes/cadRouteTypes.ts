import type { FastifyReply, FastifyRequest } from "fastify";

export type RequireApiSession = (request: FastifyRequest, reply: FastifyReply) => boolean;
