"""Idempotently seed the initial curated Thai herbal plant catalogue.

Plants and whole materials are botanical records, not single molecules. This
script intentionally does not assign surrogate SMILES or QSAR eligibility.
"""
from __future__ import annotations

import os
from pathlib import Path
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# The training notebook can run either inside Docker (host ``postgres``) or
# from a local Windows kernel (published port on ``localhost``). Docker Compose
# supplies DATABASE_URL explicitly; local Run All gets this conservative
# development fallback without changing backend production configuration.
if not os.environ.get("DATABASE_URL"):
    os.environ["DATABASE_URL"] = (
        "postgresql://ralphguard:ralphguard_dev@localhost:5432/ralphguard"
    )

from app.models.herbal_registry import HerbalMaterial, HerbalPlant

engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

SOURCE = "Thai Herbal Pharmacopoeia, Department of Medical Sciences"
SOURCE_URL = "https://bdn-thp.dmsc.moph.go.th/"

HERBS = [
    ("กระชาย", "Fingerroot", "Boesenbergia rotunda (L.) Mansf.", "Zingiberaceae", "rhizome"),
    ("กะเพรา", "Holy basil", "Ocimum tenuiflorum L.", "Lamiaceae", "leaf"),
    ("ขมิ้นชัน", "Turmeric", "Curcuma longa L.", "Zingiberaceae", "rhizome"),
    ("ขิง", "Ginger", "Zingiber officinale Roscoe", "Zingiberaceae", "rhizome"),
    ("ชะเอมเทศ", "Liquorice", "Glycyrrhiza glabra L.", "Fabaceae", "root"),
    ("ตะไคร้", "Lemongrass", "Cymbopogon citratus (DC.) Stapf", "Poaceae", "leaf and stem"),
    ("บัวบก", "Gotu kola", "Centella asiatica (L.) Urb.", "Apiaceae", "aerial part"),
    ("ฟ้าทะลายโจร", "Green chiretta", "Andrographis paniculata (Burm.f.) Nees", "Acanthaceae", "aerial part"),
    ("มะกรูด", "Makrut lime", "Citrus hystrix DC.", "Rutaceae", "peel and leaf"),
    ("มะขามป้อม", "Indian gooseberry", "Phyllanthus emblica L.", "Phyllanthaceae", "fruit"),
    ("มังคุด", "Mangosteen", "Garcinia mangostana L.", "Clusiaceae", "fruit pericarp"),
    ("ว่านหางจระเข้", "Aloe vera", "Aloe vera (L.) Burm.f.", "Asphodelaceae", "leaf gel"),
    ("ไพล", "Plai", "Zingiber montanum (J.Koenig) Link ex A.Dietr.", "Zingiberaceae", "rhizome"),
    ("บอระเพ็ด", "Boraphet", "Tinospora crispa (L.) Hook.f. & Thomson", "Menispermaceae", "stem"),
    ("บัวหลวง", "Sacred lotus", "Nelumbo nucifera Gaertn.", "Nelumbonaceae", "stamen"),
    ("ช้าพลู", "Wild betel", "Piper sarmentosum Roxb.", "Piperaceae", "leaf"),
    ("จันทน์แดง", "Red sandalwood", "Pterocarpus santalinus L.f.", "Fabaceae", "heartwood"),
    ("จันทน์ขาว", "Sandalwood", "Santalum album L.", "Santalaceae", "heartwood"),
    ("ชุมเห็ดไทย", "Sickle senna", "Senna tora (L.) Roxb.", "Fabaceae", "seed"),
    ("ชุมเห็ดเทศ", "Ringworm bush", "Senna alata (L.) Roxb.", "Fabaceae", "leaf"),
    ("กระชายดำ", "Thai black ginger", "Kaempferia parviflora Wall. ex Baker", "Zingiberaceae", "rhizome"),
    ("กระเจี๊ยบแดง", "Roselle", "Hibiscus sabdariffa L.", "Malvaceae", "calyx"),
    ("กระเทียม", "Garlic", "Allium sativum L.", "Amaryllidaceae", "bulb"),
    ("กระทือ", "Shampoo ginger", "Zingiber zerumbet (L.) Sm.", "Zingiberaceae", "rhizome"),
    ("กระวาน", "Siam cardamom", "Wurfbainia testacea (Ridl.) Škorničk. & A.D.Poulsen", "Zingiberaceae", "fruit"),
    ("คูน", "Golden shower", "Cassia fistula L.", "Fabaceae", "fruit pulp"),
    ("มะระขี้นก", "Bitter melon", "Momordica charantia L.", "Cucurbitaceae", "fruit"),
    ("มะเดื่ออุทุมพร", "Cluster fig", "Ficus racemosa L.", "Moraceae", "bark"),
    ("ลูกจันทน์", "Nutmeg", "Myristica fragrans Houtt.", "Myristicaceae", "seed"),
    ("ว่านมหาเมฆ", "Curcuma aeruginosa", "Curcuma aeruginosa Roxb.", "Zingiberaceae", "rhizome"),
]


def main() -> None:
    created = 0
    with SessionLocal() as db:
        for thai_name, english_name, scientific_name, family, plant_part in HERBS:
            plant = db.scalar(
                select(HerbalPlant).where(
                    HerbalPlant.accepted_scientific_name == scientific_name
                )
            )
            if plant is None:
                plant = HerbalPlant(
                    thai_name=thai_name,
                    english_name=english_name,
                    scientific_name=scientific_name,
                    accepted_scientific_name=scientific_name,
                    family=family,
                    synonyms=[],
                    source=SOURCE,
                    provenance={"source_url": SOURCE_URL, "seed_version": 1},
                    verification_status="curated",
                )
                db.add(plant)
                db.flush()
                created += 1
            material = db.scalar(
                select(HerbalMaterial).where(
                    HerbalMaterial.herb_id == plant.id,
                    HerbalMaterial.plant_part == plant_part,
                    HerbalMaterial.material_type == "whole_botanical",
                )
            )
            if material is None:
                db.add(
                    HerbalMaterial(
                        herb_id=plant.id,
                        plant_part=plant_part,
                        material_type="whole_botanical",
                        description="Botanical material; composition varies and is not represented by one SMILES.",
                        source=SOURCE,
                    )
                )
        db.commit()
    print({"created_plants": created, "catalogue_size": len(HERBS)})


if __name__ == "__main__":
    main()
