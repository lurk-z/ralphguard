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

# Second curation batch. These plants are widely used in Thai traditional
# medicine and appear in the Thai Herbal Pharmacopoeia / National List of
# Herbal Medicinal Products, but their accepted binomials here have not yet
# been cross-checked entry-by-entry against THP and Plants of the World Online.
# They are therefore seeded as ``pending`` so the catalogue can grow without
# claiming a verification that has not happened — the same candidate/production
# separation the QSAR models use. Promote a row to ``curated`` only after its
# accepted name, family and plant part have been confirmed against the source.
HERBS_PENDING_REVIEW = [
    ("ข่า", "Greater galangal", "Alpinia galanga (L.) Willd.", "Zingiberaceae", "rhizome"),
    ("ขมิ้นอ้อย", "Zedoary", "Curcuma zedoaria (Christm.) Roscoe", "Zingiberaceae", "rhizome"),
    ("ว่านชักมดลูก", "Curcuma comosa", "Curcuma comosa Roxb.", "Zingiberaceae", "rhizome"),
    ("เร่ว", "Bastard cardamom", "Wurfbainia villosa (Lour.) Škorničk. & A.D.Poulsen", "Zingiberaceae", "fruit"),
    ("กระวานเทศ", "Green cardamom", "Elettaria cardamomum (L.) Maton", "Zingiberaceae", "fruit"),
    ("ดีปลี", "Long pepper", "Piper retrofractum Vahl", "Piperaceae", "fruit"),
    ("พริกไทย", "Black pepper", "Piper nigrum L.", "Piperaceae", "fruit"),
    ("พลู", "Betel", "Piper betle L.", "Piperaceae", "leaf"),
    ("พลูคาว", "Fish mint", "Houttuynia cordata Thunb.", "Saururaceae", "whole plant"),
    ("รางจืด", "Laurel clock vine", "Thunbergia laurifolia Lindl.", "Acanthaceae", "leaf"),
    ("ทองพันชั่ง", "Snake jasmine", "Rhinacanthus nasutus (L.) Kurz", "Acanthaceae", "leaf and root"),
    ("พญายอ", "Snake plant", "Clinacanthus nutans (Burm.f.) Lindau", "Acanthaceae", "leaf"),
    ("เสลดพังพอนตัวผู้", "Hophead Philippine violet", "Barleria lupulina Lindl.", "Acanthaceae", "leaf"),
    ("เหงือกปลาหมอ", "Sea holly", "Acanthus ebracteatus Vahl", "Acanthaceae", "whole plant"),
    ("หญ้าหนวดแมว", "Java tea", "Orthosiphon aristatus (Blume) Miq.", "Lamiaceae", "leaf"),
    ("โหระพา", "Sweet basil", "Ocimum basilicum L.", "Lamiaceae", "leaf"),
    ("แมงลัก", "Hoary basil", "Ocimum americanum L.", "Lamiaceae", "seed"),
    ("สะระแหน่", "Kitchen mint", "Mentha cordifolia Opiz ex Fresen.", "Lamiaceae", "leaf"),
    ("คนทีสอ", "Simple-leaf chastetree", "Vitex trifolia L.", "Lamiaceae", "leaf"),
    ("หญ้าปักกิ่ง", "Murdannia", "Murdannia loriformis (Hassk.) R.S.Rao & Kammathy", "Commelinaceae", "whole plant"),
    ("เจตมูลเพลิงแดง", "Rosy leadwort", "Plumbago indica L.", "Plumbaginaceae", "root"),
    ("เพชรสังฆาต", "Veldt grape", "Cissus quadrangularis L.", "Vitaceae", "stem"),
    ("เถาวัลย์เปรียง", "Jewel vine", "Derris scandens (Roxb.) Benth.", "Fabaceae", "stem"),
    ("กวาวเครือขาว", "White kwao krua", "Pueraria candollei var. mirifica (Airy Shaw & Suvat.) Niyomdham", "Fabaceae", "tuberous root"),
    ("ขี้เหล็ก", "Siamese cassia", "Senna siamea (Lam.) H.S.Irwin & Barneby", "Fabaceae", "leaf"),
    ("มะขาม", "Tamarind", "Tamarindus indica L.", "Fabaceae", "fruit pulp"),
    ("ฝาง", "Sappanwood", "Biancaea sappan (L.) Tod.", "Fabaceae", "heartwood"),
    ("ชะเอมไทย", "Thai liquorice", "Albizia myriophylla Benth.", "Fabaceae", "stem"),
    ("อัญชัน", "Butterfly pea", "Clitoria ternatea L.", "Fabaceae", "flower"),
    ("มะรุม", "Moringa", "Moringa oleifera Lam.", "Moringaceae", "leaf and pod"),
    ("สะเดา", "Neem", "Azadirachta indica A.Juss.", "Meliaceae", "leaf and bark"),
    ("น้อยหน่า", "Sugar apple", "Annona squamosa L.", "Annonaceae", "seed and leaf"),
    ("ทับทิม", "Pomegranate", "Punica granatum L.", "Lythraceae", "fruit rind"),
    ("ฝรั่ง", "Guava", "Psidium guajava L.", "Myrtaceae", "leaf"),
    ("กานพลู", "Clove", "Syzygium aromaticum (L.) Merr. & L.M.Perry", "Myrtaceae", "flower bud"),
    ("หว้า", "Java plum", "Syzygium cumini (L.) Skeels", "Myrtaceae", "fruit and bark"),
    ("อบเชย", "Cinnamon", "Cinnamomum verum J.Presl", "Lauraceae", "bark"),
    ("การบูร", "Camphor tree", "Cinnamomum camphora (L.) J.Presl", "Lauraceae", "wood"),
    ("สมอไทย", "Myrobalan", "Terminalia chebula Retz.", "Combretaceae", "fruit"),
    ("สมอพิเภก", "Belleric myrobalan", "Terminalia bellirica (Gaertn.) Roxb.", "Combretaceae", "fruit"),
    ("เพกา", "Indian trumpet flower", "Oroxylum indicum (L.) Kurz", "Bignoniaceae", "seed and bark"),
    ("คำฝอย", "Safflower", "Carthamus tinctorius L.", "Asteraceae", "flower"),
    ("โกฐจุฬาลัมพา", "Sweet wormwood", "Artemisia annua L.", "Asteraceae", "aerial part"),
    ("โกฐเขมา", "Atractylodes", "Atractylodes lancea (Thunb.) DC.", "Asteraceae", "rhizome"),
    ("ขลู่", "Indian camphorweed", "Pluchea indica (L.) Less.", "Asteraceae", "leaf"),
    ("หญ้าดอกขาว", "Little ironweed", "Cyanthillium cinereum (L.) H.Rob.", "Asteraceae", "whole plant"),
    ("เก๊กฮวย", "Indian chrysanthemum", "Chrysanthemum indicum L.", "Asteraceae", "flower"),
    ("ดาวเรือง", "Marigold", "Tagetes erecta L.", "Asteraceae", "flower"),
    ("โกฐสอ", "Dahurian angelica", "Angelica dahurica (Hoffm.) Benth. & Hook.f. ex Franch. & Sav.", "Apiaceae", "root"),
    ("หนุมานประสานกาย", "Schefflera", "Schefflera leucantha R.Vig.", "Araliaceae", "leaf"),
    ("ว่านน้ำ", "Sweet flag", "Acorus calamus L.", "Acoraceae", "rhizome"),
    ("บุก", "Konjac", "Amorphophallus konjac K.Koch", "Araceae", "corm"),
    ("เตยหอม", "Pandan", "Pandanus amaryllifolius Roxb.", "Pandanaceae", "leaf"),
    ("ตะไคร้หอม", "Citronella grass", "Cymbopogon nardus (L.) Rendle", "Poaceae", "leaf"),
    ("แฝกหอม", "Vetiver", "Chrysopogon zizanioides (L.) Roberty", "Poaceae", "root"),
    ("กฤษณา", "Agarwood", "Aquilaria crassna Pierre ex Lecomte", "Thymelaeaceae", "resinous wood"),
    ("ย่านาง", "Bai ya nang", "Tiliacora triandra (Colebr.) Diels", "Menispermaceae", "leaf"),
    ("ชิงช้าชาลี", "Tinospora baenzigeri", "Tinospora baenzigeri Forman", "Menispermaceae", "stem"),
    ("ลูกใต้ใบ", "Gale of the wind", "Phyllanthus amarus Schumach. & Thonn.", "Phyllanthaceae", "whole plant"),
    ("มะแว้งต้น", "Indian nightshade", "Solanum violaceum Ortega", "Solanaceae", "fruit"),
    ("มะแว้งเครือ", "Climbing brinjal", "Solanum trilobatum L.", "Solanaceae", "fruit"),
    ("ตำลึง", "Ivy gourd", "Coccinia grandis (L.) Voigt", "Cucurbitaceae", "leaf"),
    ("เจียวกู่หลาน", "Jiaogulan", "Gynostemma pentaphyllum (Thunb.) Makino", "Cucurbitaceae", "aerial part"),
    ("ส้มแขก", "Asam gelugur", "Garcinia atroviridis Griff. ex T.Anderson", "Clusiaceae", "fruit"),
    ("ชะมวง", "Cowa", "Garcinia cowa Roxb. ex Choisy", "Clusiaceae", "leaf"),
    ("ยอ", "Noni", "Morinda citrifolia L.", "Rubiaceae", "fruit"),
    ("กระท่อม", "Kratom", "Mitragyna speciosa (Korth.) Havil.", "Rubiaceae", "leaf"),
    ("มะตูม", "Bael", "Aegle marmelos (L.) Corrêa", "Rutaceae", "fruit"),
    ("มะนาว", "Key lime", "Citrus aurantiifolia (Christm.) Swingle", "Rutaceae", "fruit"),
    ("มะหาด", "Lakoocha", "Artocarpus lacucha Buch.-Ham.", "Moraceae", "heartwood"),
    ("เปล้าน้อย", "Plau noi", "Croton stellatopilosus H.Ohba", "Euphorbiaceae", "leaf"),
    ("ขันทองพยาบาท", "Suregada", "Suregada multiflora (A.Juss.) Baill.", "Euphorbiaceae", "wood"),
    ("ตีนเป็ด", "Blackboard tree", "Alstonia scholaris (L.) R.Br.", "Apocynaceae", "bark"),
    ("เทียนบ้าน", "Garden balsam", "Impatiens balsamina L.", "Balsaminaceae", "leaf"),
    ("เทียนดำ", "Black cumin", "Nigella sativa L.", "Ranunculaceae", "seed"),
    ("หอมแดง", "Shallot", "Allium ascalonicum L.", "Amaryllidaceae", "bulb"),
    ("กระเจี๊ยบเขียว", "Okra", "Abelmoschus esculentus (L.) Moench", "Malvaceae", "fruit"),
]


def _seed_batch(db, rows, *, seed_version: int, verification_status: str) -> int:
    """Insert any plant of ``rows`` that is not already catalogued.

    Existing rows are left untouched: a later batch must never silently
    downgrade a plant that a reviewer has already promoted to ``curated``.
    """
    created = 0
    for thai_name, english_name, scientific_name, family, plant_part in rows:
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
                provenance={
                    "source_url": SOURCE_URL,
                    "seed_version": seed_version,
                    "nomenclature_checked": verification_status == "curated",
                },
                verification_status=verification_status,
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
    return created


def main() -> None:
    with SessionLocal() as db:
        created_curated = _seed_batch(
            db, HERBS, seed_version=1, verification_status="curated"
        )
        created_pending = _seed_batch(
            db, HERBS_PENDING_REVIEW, seed_version=2, verification_status="pending"
        )
        db.commit()
    print(
        {
            "created_plants": created_curated + created_pending,
            "created_curated": created_curated,
            "created_pending_review": created_pending,
            "catalogue_size": len(HERBS) + len(HERBS_PENDING_REVIEW),
        }
    )


if __name__ == "__main__":
    main()
