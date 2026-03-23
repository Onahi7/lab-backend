import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Patient } from '../database/schemas/patient.schema';
import { PatientNote } from '../database/schemas/patient-note.schema';
import { IdSequence } from '../database/schemas/id-sequence.schema';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CreatePatientNoteDto } from './dto/create-patient-note.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(PatientNote.name) private patientNoteModel: Model<PatientNote>,
    @InjectModel(IdSequence.name) private idSequenceModel: Model<IdSequence>,
    private realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Generate unique patient ID in format: LAB-YYYYMMDD-XXXX
   */
  private async generatePatientId(): Promise<string> {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    const sequenceId = `patient_id_${datePart}`;

    // Find and increment the sequence atomically
    const sequence = await this.idSequenceModel.findByIdAndUpdate(
      sequenceId,
      {
        $inc: { currentValue: 1 },
        $setOnInsert: { prefix: 'LAB', datePart },
      },
      { upsert: true, new: true },
    );

    const paddedValue = sequence.currentValue.toString().padStart(4, '0');
    return `LAB-${datePart}-${paddedValue}`;
  }

  /**
   * Create a new patient
   */
  async create(
    createPatientDto: CreatePatientDto,
    userId?: string,
  ): Promise<Patient> {
    try {
      const patientId = await this.generatePatientId();

      const patient = new this.patientModel({
        ...createPatientDto,
        patientId,
        registeredBy: userId ? new Types.ObjectId(userId) : undefined,
      });

      const savedPatient = await patient.save();
      this.logger.log(`Patient created: ${savedPatient.patientId}`);

      // Emit real-time event
      this.realtimeGateway.notifyPatientCreated(savedPatient);

      return savedPatient;
    } catch (error: any) {
      if (error.code === 11000) {
        // Duplicate key error
        if (error.keyPattern?.email) {
          throw new ConflictException('Patient with this email already exists');
        }
        if (error.keyPattern?.mrn) {
          throw new ConflictException('Patient with this MRN already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Find all patients with pagination and search
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
  ): Promise<{ data: Patient[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    let query = {};

    if (search) {
      // Search by patient ID, name, or MRN
      query = {
        $or: [
          { patientId: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { mrn: { $regex: search, $options: 'i' } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.patientModel
        .find(query)
        .populate('registeredBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.patientModel.countDocuments(query).exec(),
    ]);

    return { data: data as unknown as Patient[], total, page, limit };
  }

  /**
   * Find patient by ID
   */
  async findOne(id: string): Promise<Patient> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    const patient = await this.patientModel
      .findById(id)
      .populate('registeredBy', 'fullName email')
      .exec();

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    return patient;
  }

  /**
   * Find patient by patient ID (LAB-YYYYMMDD-XXXX)
   */
  async findByPatientId(patientId: string): Promise<Patient> {
    const patient = await this.patientModel
      .findOne({ patientId })
      .populate('registeredBy', 'fullName email')
      .exec();

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    return patient;
  }

  /**
   * Search patients by name, ID, or MRN
   */
  async search(query: string): Promise<Patient[]> {
    const patients = await this.patientModel
      .find({
        $or: [
          { patientId: { $regex: query, $options: 'i' } },
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
          { mrn: { $regex: query, $options: 'i' } },
        ],
      })
      .populate('registeredBy', 'fullName email')
      .limit(20)
      .exec();

    return patients;
  }

  /**
   * Update patient
   */
  async update(id: string, updatePatientDto: UpdatePatientDto): Promise<Patient> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    try {
      const patient = await this.patientModel
        .findByIdAndUpdate(id, updatePatientDto, { new: true })
        .populate('registeredBy', 'fullName email')
        .exec();

      if (!patient) {
        throw new NotFoundException(`Patient with ID ${id} not found`);
      }

      this.logger.log(`Patient updated: ${patient.patientId}`);
      return patient;
    } catch (error: any) {
      if (error.code === 11000) {
        if (error.keyPattern?.email) {
          throw new ConflictException('Patient with this email already exists');
        }
        if (error.keyPattern?.mrn) {
          throw new ConflictException('Patient with this MRN already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Delete patient (admin only)
   */
  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    const result = await this.patientModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    this.logger.log(`Patient deleted: ${result.patientId}`);
  }

  /**
   * Add note to patient
   */
  async addNote(
    patientId: string,
    createNoteDto: CreatePatientNoteDto,
    userId?: string,
  ): Promise<PatientNote> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Verify patient exists
    const patient = await this.patientModel.findById(patientId).exec();
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    const note = new this.patientNoteModel({
      patientId: new Types.ObjectId(patientId),
      note: createNoteDto.note,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    const savedNote = await note.save();
    this.logger.log(`Note added to patient: ${patient.patientId}`);

    return savedNote;
  }

  /**
   * Get patient notes
   */
  async getNotes(patientId: string): Promise<PatientNote[]> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    const notes = await this.patientNoteModel
      .find({ patientId: new Types.ObjectId(patientId) })
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .exec();

    return notes;
  }

  /**
   * Get patient orders
   */
  async getOrders(patientId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Verify patient exists
    const patient = await this.patientModel.findById(patientId).exec();
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Import Order model dynamically to avoid circular dependency
    const Order = this.patientModel.db.model('Order');
    
    const orders = await Order.find({ patientId: new Types.ObjectId(patientId) })
      .populate('orderedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .exec();

    return orders;
  }

  /**
   * Get patient results
   */
  async getResults(patientId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Verify patient exists
    const patient = await this.patientModel.findById(patientId).exec();
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Get all orders for this patient
    const Order = this.patientModel.db.model('Order');
    const orders = await Order.find({ patientId: new Types.ObjectId(patientId) }).exec();
    const orderIds = orders.map((order: any) => order._id);

    // Get all results for these orders
    const Result = this.patientModel.db.model('Result');
    const results = await Result.find({ orderId: { $in: orderIds } })
      .populate('orderId', 'orderNumber')
      .populate('resultedBy', 'fullName email')
      .populate('verifiedBy', 'fullName email')
      .sort({ resultedAt: -1 })
      .exec();

    return results;
  }
}
