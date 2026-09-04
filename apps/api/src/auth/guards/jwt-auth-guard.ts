// NestJS core modules
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Express types
import { Request } from 'express'; 

// Types from shared package
import { JwtPayload } from '@food-delivery/types';  

@Injectable() 
export class JwtAuthGuard implements CanActivate{
    constructor(private readonly jwtService:JwtService){}
    async canActivate(context:ExecutionContext):Promise<boolean>{
        const request = context.switchToHttp().getRequest<Request & {user:JwtPayload}>();
        // header authorization: Bearer <token>
        const authHeader = request.headers.authorization;
        if(!authHeader)
            throw new UnauthorizedException('Unauthorized no token provided');
        
       const  token = authHeader.split(' ')[1]; 
       if(!token)  throw new UnauthorizedException('Unauthorized no token provided');
       try{
         
         const payload =  this.jwtService.verify<JwtPayload>(token);
         request.user = payload;
         return true;
       }catch(error){    
        throw new UnauthorizedException('Inalid or Expired tokens');
       }
        
        
    }
}
      