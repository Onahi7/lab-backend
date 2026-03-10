import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './settings.schema';

const PRINTER_SETTINGS_KEY = 'printer_settings';

interface ThermalSettings {
  enabled: boolean;
  copies: number;
  autoPrintOnPayment: boolean;
}

interface A4Settings {
  enabled: boolean;
  copies: number;
  paperSize: string;
  orientation: string;
  autoPrintOnResult: boolean;
}

export interface PrinterSettingsDoc {
  thermal: ThermalSettings;
  a4: A4Settings;
}

const DEFAULT_PRINTER_SETTINGS: PrinterSettingsDoc = {
  thermal: {
    enabled: true,
    copies: 2,
    autoPrintOnPayment: true,
  },
  a4: {
    enabled: true,
    copies: 1,
    paperSize: 'A4',
    orientation: 'portrait',
    autoPrintOnResult: false,
  },
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name)
    private readonly settingsModel: Model<SettingsDocument>,
  ) {}

  async getPrinterSettings(): Promise<PrinterSettingsDoc> {
    const doc = await this.settingsModel
      .findOne({ key: PRINTER_SETTINGS_KEY })
      .lean()
      .exec();
    return doc ? (doc.value as PrinterSettingsDoc) : DEFAULT_PRINTER_SETTINGS;
  }

  async updatePrinterSettings(
    patch: Partial<PrinterSettingsDoc>,
  ): Promise<PrinterSettingsDoc> {
    const current = await this.getPrinterSettings();
    const merged: PrinterSettingsDoc = {
      thermal: { ...current.thermal, ...(patch.thermal ?? {}) },
      a4: { ...current.a4, ...(patch.a4 ?? {}) },
    };

    await this.settingsModel
      .findOneAndUpdate(
        { key: PRINTER_SETTINGS_KEY },
        { $set: { value: merged } },
        { upsert: true, new: true },
      )
      .exec();

    return merged;
  }
}
