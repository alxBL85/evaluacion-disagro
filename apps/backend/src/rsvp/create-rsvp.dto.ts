import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  IsISO8601,
} from 'class-validator';

export class CreateRsvpBodyDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsISO8601()
  attendanceDate!: string;

  @IsArray()
  @ArrayMinSize(1, {
    message: 'Debe seleccionar al menos un servicio o producto',
  })
  @IsString({ each: true })
  selectedItemIds!: string[];
}
